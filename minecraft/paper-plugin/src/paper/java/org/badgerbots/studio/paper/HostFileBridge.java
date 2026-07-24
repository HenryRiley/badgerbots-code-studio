package org.badgerbots.studio.paper;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;
import java.util.logging.Level;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.badgerbots.studio.runtime.AtomicProgramRuntime;
import org.badgerbots.studio.runtime.ScopeKey;
import org.bukkit.entity.Player;
import org.bukkit.entity.Sheep;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

/**
 * Authenticated local file transport owned by BadgerBots Host. It is intentionally not a network
 * listener: browsers cannot call the plugin or a teacher-laptop port.
 */
final class HostFileBridge {
  private static final Gson GSON = new Gson();
  private static final int MAX_REQUEST_BYTES = 512 * 1024;

  private final JavaPlugin plugin;
  private final PaperRuntimeGateway gateway;
  private final SheepCityWorld sheepCity;
  private final Path inbox;
  private final Path outbox;
  private final byte[] secret;
  private BukkitTask task;
  private String activeProgramVersionId;

  private HostFileBridge(
      JavaPlugin plugin,
      PaperRuntimeGateway gateway,
      SheepCityWorld sheepCity,
      Path root,
      byte[] secret) {
    this.plugin = plugin;
    this.gateway = gateway;
    this.sheepCity = sheepCity;
    this.inbox = root.resolve("inbox");
    this.outbox = root.resolve("outbox");
    this.secret = secret.clone();
  }

  static HostFileBridge fromSystemProperties(
      JavaPlugin plugin, PaperRuntimeGateway gateway, SheepCityWorld sheepCity) {
    String directory = System.getProperty("badgerbots.bridge.dir");
    String encodedSecret = System.getenv("BADGERBOTS_PAPER_BRIDGE_SECRET");
    if (directory == null || encodedSecret == null) {
      plugin
          .getLogger()
          .warning(
              "Host bridge is disabled. Start Paper through the BadgerBots prototype launcher.");
      return new HostFileBridge(
          plugin,
          gateway,
          sheepCity,
          plugin.getDataFolder().toPath().resolve("disabled-bridge"),
          new byte[32]);
    }
    byte[] decoded;
    try {
      decoded = Base64.getUrlDecoder().decode(encodedSecret);
    } catch (IllegalArgumentException exception) {
      throw new IllegalStateException("BadgerBots Host bridge secret is invalid.", exception);
    }
    if (decoded.length < 32) {
      throw new IllegalStateException("BadgerBots Host bridge secret must contain 32 bytes.");
    }
    return new HostFileBridge(plugin, gateway, sheepCity, Path.of(directory), decoded);
  }

  void start() {
    if (System.getProperty("badgerbots.bridge.dir") == null) return;
    try {
      Files.createDirectories(inbox);
      Files.createDirectories(outbox);
    } catch (IOException exception) {
      throw new IllegalStateException("BadgerBots Host bridge directories could not be created.", exception);
    }
    task =
        plugin
            .getServer()
            .getScheduler()
            .runTaskTimer(plugin, this::poll, 1L, 2L);
    plugin.getLogger().info("Authenticated BadgerBots Host bridge is ready.");
  }

  void stop() {
    if (task != null) task.cancel();
    task = null;
    activeProgramVersionId = null;
  }

  private void poll() {
    try (DirectoryStream<Path> stream = Files.newDirectoryStream(inbox, "*.json")) {
      int processed = 0;
      for (Path request : stream) {
        if (processed++ >= 8) break;
        process(request);
      }
    } catch (IOException exception) {
      plugin.getLogger().log(Level.WARNING, "Host bridge inbox could not be read.", exception);
    }
  }

  private void process(Path requestPath) {
    String filename = requestPath.getFileName().toString();
    if (!filename.matches("[A-Za-z0-9_-]{1,100}\\.json")) {
      deleteQuietly(requestPath);
      return;
    }
    String commandId = filename.substring(0, filename.length() - 5);
    Path responsePath = outbox.resolve(filename);
    if (Files.exists(responsePath)) {
      deleteQuietly(requestPath);
      return;
    }
    try {
      if (Files.size(requestPath) > MAX_REQUEST_BYTES) {
        writeResponse(
            responsePath,
            response(commandId, "rejected", "request_too_large", "Host request exceeded 512 KB."));
        deleteQuietly(requestPath);
        return;
      }
      String requestText = Files.readString(requestPath);
      requireJsonDepth(requestText, 8);
      JsonObject wrapper = GSON.fromJson(requestText, JsonObject.class);
      String payload = wrapper.get("payload").getAsString();
      String signature = wrapper.get("signature").getAsString();
      if (!verify(payload, signature)) {
        writeResponse(
            responsePath,
            response(commandId, "rejected", "invalid_signature", "Host signature was rejected."));
        deleteQuietly(requestPath);
        return;
      }
      requireJsonDepth(payload, 16);
      JsonObject command = GSON.fromJson(payload, JsonObject.class);
      if (!commandId.equals(requiredString(command, "commandId"))) {
        throw new IllegalArgumentException("Host command identifier did not match its file.");
      }
      JsonObject result =
          switch (requiredString(command, "kind")) {
            case "deploy_program" -> deploy(command);
            case "stop_program" -> stopProgram(command);
            default ->
                response(
                    commandId,
                    "rejected",
                    "unsupported_command",
                    "Paper rejected an unsupported Host command.");
          };
      writeResponse(responsePath, result);
    } catch (RuntimeException | IOException | GeneralSecurityException exception) {
      plugin.getLogger().log(Level.WARNING, "Host command was rejected.", exception);
      try {
        writeResponse(
            responsePath,
            response(
                commandId,
                "rejected",
                "paper_command_failed",
                friendlyMessage(exception)));
      } catch (IOException | GeneralSecurityException responseFailure) {
        plugin
            .getLogger()
            .log(Level.SEVERE, "Host command response could not be written.", responseFailure);
      }
    } finally {
      deleteQuietly(requestPath);
    }
  }

  private JsonObject deploy(JsonObject command) {
    String commandId = requiredString(command, "commandId");
    String nextVersion = requiredString(command, "programVersionId");
    if (command.has("expectedActiveVersionId")
        && !command.get("expectedActiveVersionId").getAsString().equals(activeProgramVersionId)) {
      return response(
          commandId,
          "rejected",
          "active_version_conflict",
          "Paper is running a different program version.");
    }
    Player player = sheepCity.activePlayer();
    JsonObject scope = command.getAsJsonObject("scope");
    ScopeKey key =
        new ScopeKey(
            requiredString(scope, "organizationId"),
            requiredString(scope, "locationId"),
            requiredString(scope, "sessionId"),
            requiredString(scope, "projectId"),
            requiredString(scope, "studentId"),
            nextVersion,
            player.getWorld().getUID().toString());
    AtomicProgramRuntime.DeploymentResult result =
        gateway.deploy(
            player.getUniqueId(),
            key,
            InstructionGraphJson.decode(command.getAsJsonObject("graph")));
    if (!result.ok()) {
      return response(
          commandId,
          "rejected",
          "deployment_validation_failed",
          result.message());
    }
    activeProgramVersionId = result.activeProgramVersionId();
    Sheep sheep = sheepCity.createDemoSheep();
    gateway.registerSheep(sheep.getUniqueId(), key, sheep.getLocation());
    return response(commandId, "accepted", null, "Program activated in Sheep City.");
  }

  private JsonObject stopProgram(JsonObject command) {
    Player player = sheepCity.activePlayer();
    gateway.stopPlayer(player.getUniqueId());
    activeProgramVersionId = null;
    return response(
        requiredString(command, "commandId"), "accepted", null, "Program stopped in Sheep City.");
  }

  private JsonObject response(
      String commandId, String status, String code, String message) {
    JsonObject result = new JsonObject();
    result.addProperty("commandId", commandId);
    result.addProperty("status", status);
    if (code != null) result.addProperty("code", code);
    if (activeProgramVersionId != null) {
      result.addProperty("activeProgramVersionId", activeProgramVersionId);
    }
    result.addProperty("message", message);
    return result;
  }

  private void writeResponse(Path destination, JsonObject response)
      throws IOException, GeneralSecurityException {
    String payload = GSON.toJson(response);
    JsonObject wrapper = new JsonObject();
    wrapper.addProperty("payload", payload);
    wrapper.addProperty("signature", sign(payload));
    Path temporary = destination.resolveSibling(destination.getFileName() + ".new");
    Files.writeString(temporary, GSON.toJson(wrapper), StandardCharsets.UTF_8);
    try {
      Files.move(
          temporary,
          destination,
          StandardCopyOption.ATOMIC_MOVE,
          StandardCopyOption.REPLACE_EXISTING);
    } catch (AtomicMoveNotSupportedException exception) {
      Files.move(temporary, destination, StandardCopyOption.REPLACE_EXISTING);
    }
  }

  private boolean verify(String payload, String signature) throws GeneralSecurityException {
    byte[] provided;
    try {
      provided = HexFormat.of().parseHex(signature);
    } catch (IllegalArgumentException exception) {
      return false;
    }
    return MessageDigest.isEqual(mac(payload), provided);
  }

  private String sign(String payload) throws GeneralSecurityException {
    return HexFormat.of().formatHex(mac(payload));
  }

  private byte[] mac(String payload) throws GeneralSecurityException {
    Mac hmac = Mac.getInstance("HmacSHA256");
    hmac.init(new SecretKeySpec(secret, "HmacSHA256"));
    return hmac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
  }

  private static String requiredString(JsonObject value, String name) {
    if (value == null || !value.has(name) || !value.get(name).isJsonPrimitive()) {
      throw new IllegalArgumentException("Host command field " + name + " is required.");
    }
    String result = value.get(name).getAsString();
    if (result.isBlank() || result.length() > 200) {
      throw new IllegalArgumentException("Host command field " + name + " is invalid.");
    }
    return result;
  }

  private static String friendlyMessage(Exception exception) {
    String message = exception.getMessage();
    if (message == null || message.isBlank()) return "Paper could not apply the Host command.";
    return message.length() <= 300 ? message : message.substring(0, 300);
  }

  private static void requireJsonDepth(String json, int maximumDepth) {
    int depth = 0;
    boolean quoted = false;
    boolean escaped = false;
    for (int index = 0; index < json.length(); index++) {
      char character = json.charAt(index);
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quoted && character == '\\') {
        escaped = true;
        continue;
      }
      if (character == '"') {
        quoted = !quoted;
        continue;
      }
      if (quoted) continue;
      if (character == '{' || character == '[') {
        depth++;
        if (depth > maximumDepth) {
          throw new IllegalArgumentException("Host command JSON nesting is too deep.");
        }
      } else if (character == '}' || character == ']') {
        depth--;
        if (depth < 0) throw new IllegalArgumentException("Host command JSON is malformed.");
      }
    }
    if (quoted || depth != 0) throw new IllegalArgumentException("Host command JSON is malformed.");
  }

  private static void deleteQuietly(Path path) {
    try {
      Files.deleteIfExists(path);
    } catch (IOException ignored) {
      // A duplicate retry is safe because response files are command-id keyed.
    }
  }
}
