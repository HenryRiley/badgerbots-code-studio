package org.badgerbots.studio.paper;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.sun.management.OperatingSystemMXBean;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.badgerbots.studio.runtime.InstructionGraph;
import org.badgerbots.studio.runtime.Instruction;
import org.badgerbots.studio.runtime.ScopeKey;
import org.bukkit.Bukkit;
import org.bukkit.DyeColor;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.WorldCreator;
import org.bukkit.WorldType;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Sheep;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

/**
 * A real-Paper, 25-scope capacity probe. It deliberately simulates camper connections instead of
 * claiming that it creates 25 authenticated Minecraft clients.
 */
final class PaperCapacityBenchmark implements CommandExecutor {
  private static final Gson GSON = new Gson();
  private static final int STUDENTS = 25;
  private static final int SHARED_WORLD_COUNT = 3;

  private record Sample(
      int schemaVersion,
      String strategy,
      String phase,
      int activeStudents,
      double processResidentMiB,
      double heapUsedMiB,
      double cpuPercent,
      double tickMs,
      double tps,
      double chunkLoadMs,
      double chunkUnloadMs,
      double runLatencyMs,
      double teacherResponseMs,
      int entityCount,
      double diskMiB,
      String measuredAt) {}

  private final JavaPlugin plugin;
  private final PaperRuntimeGateway gateway;
  private BukkitTask activeTask;
  private BukkitTask memoryTask;
  private volatile double residentMiB = -1;
  private final String machineId;
  private String comparisonRunId = opaqueId("benchmark");
  private final Set<String> completedStrategies = new HashSet<>();

  PaperCapacityBenchmark(JavaPlugin plugin, PaperRuntimeGateway gateway) {
    this.plugin = plugin;
    this.gateway = gateway;
    this.machineId = loadMachineId(plugin.getDataFolder().toPath());
  }

  @Override
  public synchronized boolean onCommand(
      CommandSender sender, Command command, String label, String[] arguments) {
    if (!sender.isOp()) {
      sender.sendMessage("Only a server operator may run the capacity benchmark.");
      return true;
    }
    if (activeTask != null) {
      sender.sendMessage("A BadgerBots capacity benchmark is already running.");
      return true;
    }
    if (arguments.length != 1
        || (!arguments[0].equals("separate-worlds")
            && !arguments[0].equals("shared-instances"))) {
      sender.sendMessage("Use /bbbenchmark separate-worlds or /bbbenchmark shared-instances.");
      return true;
    }
    if (completedStrategies.contains(arguments[0])) {
      comparisonRunId = opaqueId("benchmark");
      completedStrategies.clear();
    }
    BenchmarkRun run = new BenchmarkRun(arguments[0], sender);
    memoryTask =
        Bukkit.getScheduler()
            .runTaskTimerAsynchronously(
                plugin, () -> residentMiB = measureResidentMemoryMiB(), 0L, 5L);
    activeTask = Bukkit.getScheduler().runTaskTimer(plugin, run, 20L, 1L);
    sender.sendMessage(
        "Started the 25-student "
            + arguments[0]
            + " benchmark. Keep the teacher laptop plugged in and leave Paper running.");
    return true;
  }

  private final class BenchmarkRun implements Runnable {
    private final String strategy;
    private final CommandSender sender;
    private final String runId = comparisonRunId;
    private final List<World> worlds = new ArrayList<>();
    private final List<UUID> syntheticPlayers = new ArrayList<>();
    private final List<Sample> samples = new ArrayList<>();
    private int step;
    private long expectedTickNanos = System.nanoTime();
    private double lastChunkLoadMs;
    private double lastChunkUnloadMs;
    private double lastRunLatencyMs;

    private BenchmarkRun(String strategy, CommandSender sender) {
      this.strategy = strategy;
      this.sender = sender;
    }

    @Override
    public void run() {
      long started = System.nanoTime();
      double teacherResponseMs =
          Math.max(0, (started - expectedTickNanos) / 1_000_000.0);
      expectedTickNanos = started + 50_000_000L;
      try {
        executeStep(teacherResponseMs);
      } catch (RuntimeException | IOException exception) {
        fail(exception);
      }
    }

    private void executeStep(double teacherResponseMs) throws IOException {
      lastChunkLoadMs = 0;
      lastChunkUnloadMs = 0;
      lastRunLatencyMs = 0;
      if (step == 0) {
        sample("baseline", 0, teacherResponseMs);
      } else if (step <= STUDENTS) {
        allocate(step - 1);
        sample("join", step, teacherResponseMs);
      } else if (step <= STUDENTS * 2) {
        deploy(step - STUDENTS - 1);
        sample("run", STUDENTS, teacherResponseMs);
      } else if (step == 51) {
        sample("steady", STUDENTS, teacherResponseMs);
      } else if (step <= 53) {
        sample("visitor", STUDENTS, teacherResponseMs);
      } else if (step <= 78) {
        int index = 78 - step;
        disconnect(index);
        sample("disconnect", 24 - (step - 54), teacherResponseMs);
      } else {
        recover();
        sample("recovery", 0, teacherResponseMs);
        finish();
        return;
      }
      if (step == 25 || step == 50 || step == 53 || step == 78) {
        plugin
            .getLogger()
            .info(
                "BADGERBOTS_BENCHMARK_PROGRESS "
                    + strategy
                    + " "
                    + samples.size()
                    + "/80 samples");
      }
      step++;
    }

    private void allocate(int index) {
      long started = System.nanoTime();
      if (strategy.equals("separate-worlds")) {
        World world = createWorld("bb_bench_" + compactRunId() + "_" + index);
        loadCompactInstance(world, 0, 0);
        worlds.add(world);
      } else {
        int worldIndex = index % SHARED_WORLD_COUNT;
        while (worlds.size() <= worldIndex) {
          worlds.add(createWorld("bb_bench_" + compactRunId() + "_shared_" + worlds.size()));
        }
        int instanceIndex = index / SHARED_WORLD_COUNT;
        int x = (instanceIndex % 3) * 512;
        int z = (instanceIndex / 3) * 512;
        loadCompactInstance(worlds.get(worldIndex), x >> 4, z >> 4);
      }
      lastChunkLoadMs = elapsedMs(started);
    }

    private void deploy(int index) {
      World world =
          strategy.equals("separate-worlds")
              ? worlds.get(index)
              : worlds.get(index % SHARED_WORLD_COUNT);
      UUID playerId = UUID.nameUUIDFromBytes((runId + ":" + index).getBytes(StandardCharsets.UTF_8));
      ScopeKey scope =
          new ScopeKey(
              "benchmark-organization",
              "benchmark-location",
              "benchmark-session",
              "sheep-city",
              "benchmark-student-" + index,
              "benchmark-program-" + index,
              world.getUID().toString());
      InstructionGraph graph =
          new InstructionGraph(
              2,
              2,
              "benchmark-program-" + index,
              "sheep-city",
              List.of(
                  new InstructionGraph.Handler(
                      "benchmark-projectile",
                      InstructionGraph.EventType.PROJECTILE_HIT,
                      List.of(new Instruction.Explode("benchmark-explode", 0.5))),
                  new InstructionGraph.Handler(
                      "benchmark-move", InstructionGraph.EventType.PLAYER_MOVE, List.of()),
                  new InstructionGraph.Handler(
                      "benchmark-sheep-spawn",
                      InstructionGraph.EventType.SHEEP_SPAWN,
                      List.of(
                          new Instruction.SetSheepColor("benchmark-color", "RED"),
                          new Instruction.SetSheepSpeed("benchmark-speed", 2.0))),
                  new InstructionGraph.Handler(
                      "benchmark-sheep-death",
                      InstructionGraph.EventType.SHEEP_DEATH,
                      List.of(new Instruction.DropItem("benchmark-drop", "GOLD_NUGGET", 1)))));
      long started = System.nanoTime();
      if (!gateway.deploy(playerId, scope, graph).ok()) {
        throw new IllegalStateException("Benchmark runtime deployment was rejected.");
      }
      int instanceIndex = index / SHARED_WORLD_COUNT;
      double x =
          strategy.equals("separate-worlds") ? 0.5 : (instanceIndex % 3) * 512 + 0.5;
      double z =
          strategy.equals("separate-worlds") ? 0.5 : (instanceIndex / 3) * 512 + 0.5;
      Location location = new Location(world, x, 66, z);
      Sheep sheep = world.spawn(location, Sheep.class);
      gateway.executeBenchmarkEvent(
          scope, InstructionGraph.EventType.PROJECTILE_HIT, null, location);
      gateway.executeBenchmarkEvent(scope, InstructionGraph.EventType.PLAYER_MOVE, null, location);
      gateway.executeBenchmarkEvent(
          scope, InstructionGraph.EventType.SHEEP_SPAWN, sheep.getUniqueId(), location);
      gateway.executeBenchmarkEvent(
          scope, InstructionGraph.EventType.SHEEP_DEATH, sheep.getUniqueId(), location);
      if (sheep.getColor() != DyeColor.RED) {
        throw new IllegalStateException("Benchmark Sheep City handler did not execute.");
      }
      sheep.remove();
      lastRunLatencyMs = elapsedMs(started);
      syntheticPlayers.add(playerId);
    }

    private void disconnect(int index) {
      gateway.stopPlayer(syntheticPlayers.get(index));
      if (strategy.equals("separate-worlds")) {
        World world = worlds.get(index);
        long started = System.nanoTime();
        world.save();
        if (!Bukkit.unloadWorld(world, true)) {
          throw new IllegalStateException("Paper refused to unload a benchmark world.");
        }
        lastChunkUnloadMs = elapsedMs(started);
      }
    }

    private void recover() {
      if (strategy.equals("shared-instances")) {
        long started = System.nanoTime();
        for (World world : worlds) {
          world.save();
          if (!Bukkit.unloadWorld(world, true)) {
            throw new IllegalStateException("Paper refused to unload a shared benchmark world.");
          }
        }
        lastChunkUnloadMs = elapsedMs(started);
      }
    }

    private void sample(String phase, int activeStudents, double teacherResponseMs) {
      Runtime runtime = Runtime.getRuntime();
      OperatingSystemMXBean os =
          (OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
      double resident = residentMiB;
      if (isWindows() && resident < 0) {
        throw new IllegalStateException(
            "Windows working-set memory could not be measured; no capacity claim was written.");
      }
      double cpu = Math.max(0, os.getProcessCpuLoad() * 100);
      int entities =
          worlds.stream()
              .filter(world -> Bukkit.getWorld(world.getUID()) != null)
              .mapToInt(World::getEntityCount)
              .sum();
      samples.add(
          new Sample(
              1,
              strategy,
              phase,
              activeStudents,
              resident,
              (runtime.totalMemory() - runtime.freeMemory()) / 1_048_576.0,
              cpu,
              Bukkit.getAverageTickTime(),
              Math.max(0, Math.min(20.0, Bukkit.getTPS()[0])),
              lastChunkLoadMs,
              lastChunkUnloadMs,
              lastRunLatencyMs,
              teacherResponseMs,
              entities,
              benchmarkDiskMiB(),
              Instant.now().toString()));
    }

    private void finish() throws IOException {
      JsonObject evidence = new JsonObject();
      evidence.addProperty("schemaVersion", 1);
      evidence.addProperty("runId", runId);
      evidence.addProperty("recordedAt", Instant.now().toString());
      evidence.addProperty("machineId", machineId);
      evidence.addProperty("benchmarkRunId", runId);
      evidence.addProperty("strategy", strategy);
      String gitCommit = System.getProperty("badgerbots.gitCommit", "development");
      String paperSha256 = System.getProperty("badgerbots.paperSha256", "");
      String pluginSha256 = System.getProperty("badgerbots.pluginSha256", "");
      boolean releaseMetadata =
          gitCommit.matches("[a-f0-9]{7,40}")
              && paperSha256.matches("[a-f0-9]{64}")
              && pluginSha256.matches("[a-f0-9]{64}");
      evidence.addProperty(
          "evidenceKind",
          isWindows()
                  && releaseMetadata
                  && samples.stream().allMatch(sample -> sample.processResidentMiB() >= 0)
              ? "physical-paper"
              : "development-paper");
      evidence.addProperty("simulatedStudents", STUDENTS);
      evidence.addProperty("physicalMinecraftClients", 0);
      evidence.addProperty(
          "scopeNote",
          "Real Paper worlds and runtime scopes; camper connections are deterministic simulations.");
      evidence.addProperty(
          "operatingSystem",
          System.getProperty("os.name").contains("11") ? "Windows 11 x64" : "Windows 10 x64");
      evidence.addProperty(
          "cpuModel",
          System.getenv().getOrDefault("PROCESSOR_IDENTIFIER", "Unavailable outside Windows"));
      evidence.addProperty("gitCommit", gitCommit);
      evidence.addProperty("javaVersion", System.getProperty("java.runtime.version"));
      evidence.addProperty("paperBuild", Bukkit.getVersion());
      evidence.addProperty("paperSha256", paperSha256);
      evidence.addProperty("pluginSha256", pluginSha256);
      evidence.addProperty("viewDistance", Bukkit.getViewDistance());
      evidence.addProperty("simulationDistance", Bukkit.getSimulationDistance());
      evidence.addProperty("logicalProcessors", Runtime.getRuntime().availableProcessors());
      evidence.addProperty(
          "totalRamMiB",
          Math.round(
              ((OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean())
                      .getTotalMemorySize()
                  / 1_048_576.0));
      JsonArray encodedSamples = new JsonArray();
      for (Sample sample : samples) encodedSamples.add(GSON.toJsonTree(sample));
      evidence.add("samples", encodedSamples);
      Path directory = plugin.getDataFolder().toPath().resolve("benchmarks");
      Files.createDirectories(directory);
      Path output = directory.resolve("benchmark-" + strategy + "-" + runId + ".json");
      Files.writeString(output, GSON.toJson(evidence), StandardCharsets.UTF_8);
      cleanupDirectories();
      sender.sendMessage(
          "Benchmark complete: "
              + samples.size()
              + " samples saved to "
              + output.toAbsolutePath()
              + ".");
      plugin.getLogger().info("BADGERBOTS_BENCHMARK_COMPLETE " + output.toAbsolutePath());
      completedStrategies.add(strategy);
      if (completedStrategies.size() == 2) {
        comparisonRunId = opaqueId("benchmark");
        completedStrategies.clear();
      }
      stopTask();
    }

    private void fail(Exception exception) {
      for (UUID player : syntheticPlayers) gateway.stopPlayer(player);
      for (World world : List.copyOf(worlds)) {
        if (Bukkit.getWorld(world.getUID()) != null && world.getPlayers().isEmpty()) {
          Bukkit.unloadWorld(world, true);
        }
      }
      sender.sendMessage("Benchmark stopped safely: " + exception.getMessage());
      plugin.getLogger().warning("BADGERBOTS_BENCHMARK_FAILED " + exception.getMessage());
      try {
        cleanupDirectories();
      } catch (IOException cleanupFailure) {
        plugin
            .getLogger()
            .warning("Benchmark temporary directories require manual cleanup: " + compactRunId());
      }
      stopTask();
    }

    private void stopTask() {
      synchronized (PaperCapacityBenchmark.this) {
        if (activeTask != null) activeTask.cancel();
        if (memoryTask != null) memoryTask.cancel();
        activeTask = null;
        memoryTask = null;
        residentMiB = -1;
      }
    }

    private String compactRunId() {
      return runId.substring(0, 8);
    }

    private World createWorld(String name) {
      World world =
          new WorldCreator(name).type(WorldType.FLAT).generateStructures(false).createWorld();
      if (world == null) throw new IllegalStateException("Paper could not create a benchmark world.");
      world.setAutoSave(false);
      world.getWorldBorder().setSize(192);
      return world;
    }

    private void loadCompactInstance(World world, int centerChunkX, int centerChunkZ) {
      for (int chunkX = centerChunkX - 1; chunkX <= centerChunkX + 1; chunkX++) {
        for (int chunkZ = centerChunkZ - 1; chunkZ <= centerChunkZ + 1; chunkZ++) {
          world.getChunkAt(chunkX, chunkZ).load();
        }
      }
    }

    private double benchmarkDiskMiB() {
      Path container = Bukkit.getWorldContainer().toPath();
      try (var entries = Files.list(container)) {
        long bytes =
            entries
                .filter(path -> path.getFileName().toString().startsWith("bb_bench_" + compactRunId()))
                .flatMap(PaperCapacityBenchmark::files)
                .mapToLong(PaperCapacityBenchmark::size)
                .sum();
        return bytes / 1_048_576.0;
      } catch (IOException exception) {
        throw new IllegalStateException("Benchmark disk use could not be measured.", exception);
      }
    }

    private void cleanupDirectories() throws IOException {
      Path container = Bukkit.getWorldContainer().toPath();
      try (var entries = Files.list(container)) {
        for (Path path :
            entries
                .filter(
                    candidate ->
                        candidate
                            .getFileName()
                            .toString()
                            .startsWith("bb_bench_" + compactRunId()))
                .toList()) {
          try (var files = Files.walk(path)) {
            for (Path target : files.sorted(Comparator.reverseOrder()).toList()) {
              Files.deleteIfExists(target);
            }
          }
        }
      }
    }
  }

  private static java.util.stream.Stream<Path> files(Path path) {
    try {
      return Files.walk(path).filter(Files::isRegularFile);
    } catch (IOException exception) {
      throw new IllegalStateException("Benchmark files could not be measured.", exception);
    }
  }

  private static long size(Path path) {
    try {
      return Files.size(path);
    } catch (IOException exception) {
      throw new IllegalStateException("Benchmark file size could not be read.", exception);
    }
  }

  private static double elapsedMs(long startedNanos) {
    return (System.nanoTime() - startedNanos) / 1_000_000.0;
  }

  private static boolean isWindows() {
    return System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("windows");
  }

  private static String opaqueId(String prefix) {
    return prefix + "-" + UUID.randomUUID();
  }

  private static String loadMachineId(Path dataDirectory) {
    Path path = dataDirectory.resolve("benchmark-machine-id.txt");
    try {
      Files.createDirectories(dataDirectory);
      if (Files.isRegularFile(path)) {
        String existing = Files.readString(path, StandardCharsets.UTF_8).trim();
        if (existing.matches("machine-[a-f0-9-]{36}")) return existing;
      }
      String created = opaqueId("machine");
      Files.writeString(path, created, StandardCharsets.UTF_8);
      return created;
    } catch (IOException exception) {
      return opaqueId("machine");
    }
  }

  private static double measureResidentMemoryMiB() {
    if (!isWindows()) return -1;
    long pid = ProcessHandle.current().pid();
    Process process = null;
    try {
      process =
          new ProcessBuilder(
                  "tasklist", "/FI", "PID eq " + pid, "/FO", "CSV", "/NH")
              .redirectErrorStream(true)
              .start();
      if (!process.waitFor(3, TimeUnit.SECONDS)) {
        process.destroyForcibly();
        return -1;
      }
      try (BufferedReader reader =
          new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
        String line = reader.readLine();
        if (line == null || line.startsWith("INFO:")) return -1;
        List<String> columns = parseCsv(line);
        if (columns.size() < 5) return -1;
        String digits = columns.get(4).replaceAll("[^0-9]", "");
        return digits.isEmpty() ? -1 : Long.parseLong(digits) / 1024.0;
      }
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      return -1;
    } catch (IOException | NumberFormatException exception) {
      return -1;
    } finally {
      if (process != null) process.destroy();
    }
  }

  private static List<String> parseCsv(String value) {
    List<String> columns = new ArrayList<>();
    StringBuilder current = new StringBuilder();
    boolean quoted = false;
    for (int index = 0; index < value.length(); index++) {
      char character = value.charAt(index);
      if (character == '"') quoted = !quoted;
      else if (character == ',' && !quoted) {
        columns.add(current.toString());
        current.setLength(0);
      } else current.append(character);
    }
    columns.add(current.toString());
    return columns;
  }
}
