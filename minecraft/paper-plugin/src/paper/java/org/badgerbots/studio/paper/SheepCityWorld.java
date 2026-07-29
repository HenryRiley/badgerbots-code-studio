package org.badgerbots.studio.paper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import net.kyori.adventure.text.Component;
import org.bukkit.GameRules;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.World;
import org.bukkit.WorldCreator;
import org.bukkit.WorldType;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.entity.Sheep;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;

/** Owns teacher Sheep City plus private, unloadable per-camper working worlds. */
final class SheepCityWorld implements Listener, CommandExecutor {
  static final String WORLD_NAME = "badgerbots_sheep_city_prototype";
  static final int MAX_ACTIVE_CAMPER_WORLDS = 25;

  record PlayerRoute(
      String organizationId,
      String locationId,
      String sessionId,
      String camperId,
      String projectId,
      String minecraftUsername) {
    String ownerKey() {
      return sessionId + ":" + camperId;
    }

    boolean matches(
        String organization,
        String location,
        String session,
        String project,
        String student,
        String username) {
      return organizationId.equals(organization)
          && locationId.equals(location)
          && sessionId.equals(session)
          && projectId.equals(project)
          && camperId.equals(student)
          && minecraftUsername.equalsIgnoreCase(username);
    }
  }

  record RoutedPlayer(Player player, PlayerRoute route, World world) {}

  private static final class WorldLease {
    private final PlayerRoute route;
    private final World world;
    private UUID ownerPlayerId;
    private final Set<UUID> visitorIds = new HashSet<>();
    private final Set<String> approvedVisitorNames = new HashSet<>();

    private WorldLease(PlayerRoute route, World world) {
      this.route = route;
      this.world = world;
    }
  }

  private final JavaPlugin plugin;
  private final PaperRuntimeGateway gateway;
  private final String teacherUsername;
  private final NamespacedKey layoutInitializedKey;
  private final Map<String, PlayerRoute> routesByUsername = new HashMap<>();
  private final Map<String, WorldLease> leasesByOwner = new HashMap<>();
  private final Map<UUID, String> visitorOwnerByPlayer = new HashMap<>();
  private final Map<String, UUID> unloadTokens = new HashMap<>();
  private World teacherWorld;

  SheepCityWorld(JavaPlugin plugin, PaperRuntimeGateway gateway) {
    this.plugin = plugin;
    this.gateway = gateway;
    this.teacherUsername = System.getProperty("badgerbots.teacherUsername", "");
    this.layoutInitializedKey = new NamespacedKey(plugin, "prototype_layout_initialized");
  }

  void create() {
    teacherWorld = loadWorkingWorld(WORLD_NAME, "teacher");
  }

  static boolean shouldBuildLayout(boolean existedBeforeLoad, boolean markerPresent) {
    return !existedBeforeLoad && !markerPresent;
  }

  World world() {
    if (teacherWorld == null) throw new IllegalStateException("Teacher Sheep City is not loaded.");
    return teacherWorld;
  }

  synchronized void syncRoutes(List<PlayerRoute> routes) {
    if (routes.size() > MAX_ACTIVE_CAMPER_WORLDS) {
      throw new IllegalArgumentException("Host route set exceeds the 25-camper limit.");
    }
    Map<String, PlayerRoute> replacement = new HashMap<>();
    Set<String> ownerKeys = new HashSet<>();
    for (PlayerRoute route : routes) {
      validateRoute(route);
      String username = route.minecraftUsername().toLowerCase(Locale.ROOT);
      if (replacement.put(username, route) != null || !ownerKeys.add(route.ownerKey())) {
        throw new IllegalArgumentException("Host route set contains a duplicate player or camper.");
      }
    }
    routesByUsername.clear();
    routesByUsername.putAll(replacement);

    for (WorldLease lease : List.copyOf(leasesByOwner.values())) {
      if (!ownerKeys.contains(lease.route.ownerKey())) releaseOwner(lease);
    }
    for (Player player : plugin.getServer().getOnlinePlayers()) routePlayerIfMapped(player);
  }

  synchronized RoutedPlayer playerForScope(
      String organizationId,
      String locationId,
      String sessionId,
      String projectId,
      String studentId,
      String minecraftUsername) {
    PlayerRoute route = routesByUsername.get(minecraftUsername.toLowerCase(Locale.ROOT));
    if (route == null
        || !route.matches(
            organizationId,
            locationId,
            sessionId,
            projectId,
            studentId,
            minecraftUsername)) {
      throw new IllegalStateException(
          "The camper/device/Minecraft mapping is missing or no longer matches.");
    }
    Player player = plugin.getServer().getPlayerExact(route.minecraftUsername());
    if (player == null || !player.isOnline()) {
      throw new IllegalStateException(
          "The mapped Minecraft player must join before clicking Run.");
    }
    WorldLease lease = ensureLease(route);
    lease.ownerPlayerId = player.getUniqueId();
    removeVisitorAssignment(player.getUniqueId());
    if (!player.getWorld().equals(lease.world)) player.teleport(spawn(lease.world));
    return new RoutedPlayer(player, route, lease.world);
  }

  synchronized Sheep createDemoSheep(RoutedPlayer routed) {
    WorldLease lease = leasesByOwner.get(routed.route.ownerKey());
    if (lease == null || !lease.world.equals(routed.world)) {
      throw new IllegalStateException("The camper working world is not active.");
    }
    Sheep sheep =
        lease.world.spawn(new Location(lease.world, -14.5, 65, 3.5), Sheep.class);
    sheep.customName(Component.text("Sheep City Runner"));
    sheep.setCustomNameVisible(true);
    return sheep;
  }

  synchronized void stopScope(
      String organizationId,
      String locationId,
      String sessionId,
      String projectId,
      String studentId,
      String minecraftUsername) {
    PlayerRoute route = routesByUsername.get(minecraftUsername.toLowerCase(Locale.ROOT));
    if (route == null
        || !route.matches(
            organizationId,
            locationId,
            sessionId,
            projectId,
            studentId,
            minecraftUsername)) {
      throw new IllegalStateException("The exact camper route was not found for Stop.");
    }
    gateway.stopStudent(sessionId, projectId, studentId);
  }

  @EventHandler
  public synchronized void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    if (!teacherUsername.isBlank() && player.getName().equalsIgnoreCase(teacherUsername)) {
      player.setOp(true);
      giveTestKit(player);
      player.teleport(spawn(world()));
      player.sendMessage(
          Component.text("Teacher operator controls are enabled in the persistent teacher world."));
      return;
    }
    if (!routePlayerIfMapped(player)) {
      player.teleport(spawn(world()));
      player.sendMessage(
          Component.text(
              "Waiting for an instructor to map this Minecraft username in Code Studio."));
    }
  }

  @EventHandler
  public synchronized void onRespawn(PlayerRespawnEvent event) {
    Player player = event.getPlayer();
    WorldLease lease = leaseForPlayer(player.getUniqueId());
    event.setRespawnLocation(lease == null ? spawn(world()) : spawn(lease.world));
    giveTestKit(player);
  }

  @EventHandler
  public synchronized void onQuit(PlayerQuitEvent event) {
    Player player = event.getPlayer();
    removeVisitorAssignment(player.getUniqueId());
    PlayerRoute route = routesByUsername.get(player.getName().toLowerCase(Locale.ROOT));
    if (route == null) return;
    WorldLease lease = leasesByOwner.get(route.ownerKey());
    if (lease != null && player.getUniqueId().equals(lease.ownerPlayerId)) {
      gateway.stopPlayer(player.getUniqueId());
      releaseOwner(lease);
    }
  }

  @EventHandler
  public synchronized void onDamage(EntityDamageEvent event) {
    if (event.getEntity() instanceof Player player
        && isManagedWorld(player.getWorld())
        && event.getCause() == EntityDamageEvent.DamageCause.FALL) {
      event.setCancelled(true);
    }
  }

  @Override
  public synchronized boolean onCommand(
      CommandSender sender, Command command, String label, String[] arguments) {
    if (!(sender instanceof Player player)) {
      sender.sendMessage("Visitor controls are available to players only.");
      return true;
    }
    if (arguments.length != 2
        || (!arguments[0].equalsIgnoreCase("allow")
            && !arguments[0].equalsIgnoreCase("join"))) {
      player.sendMessage(Component.text("Use /bbvisit allow <player> or /bbvisit join <owner>."));
      return true;
    }
    if (arguments[0].equalsIgnoreCase("allow")) {
      approveVisitor(player, arguments[1]);
    } else {
      joinVisitor(player, arguments[1]);
    }
    return true;
  }

  private boolean routePlayerIfMapped(Player player) {
    PlayerRoute route = routesByUsername.get(player.getName().toLowerCase(Locale.ROOT));
    if (route == null) return false;
    WorldLease lease = ensureLease(route);
    lease.ownerPlayerId = player.getUniqueId();
    removeVisitorAssignment(player.getUniqueId());
    giveTestKit(player);
    player.teleport(spawn(lease.world));
    player.sendMessage(
        Component.text("Welcome to your private Sheep City working world. Changes autosave."));
    return true;
  }

  private void approveVisitor(Player owner, String visitorName) {
    PlayerRoute ownerRoute = routesByUsername.get(owner.getName().toLowerCase(Locale.ROOT));
    PlayerRoute visitorRoute = routesByUsername.get(visitorName.toLowerCase(Locale.ROOT));
    if (ownerRoute == null || visitorRoute == null) {
      owner.sendMessage(Component.text("Both players must be mapped by an instructor."));
      return;
    }
    WorldLease lease = leasesByOwner.get(ownerRoute.ownerKey());
    if (lease == null || !owner.getUniqueId().equals(lease.ownerPlayerId)) {
      owner.sendMessage(Component.text("Only the active world owner can approve visitors."));
      return;
    }
    if (ownerRoute.ownerKey().equals(visitorRoute.ownerKey())) {
      owner.sendMessage(Component.text("You are already the owner of this world."));
      return;
    }
    lease.approvedVisitorNames.add(visitorRoute.minecraftUsername().toLowerCase(Locale.ROOT));
    owner.sendMessage(Component.text(visitorRoute.minecraftUsername() + " may now visit."));
  }

  private void joinVisitor(Player visitor, String ownerName) {
    PlayerRoute visitorRoute =
        routesByUsername.get(visitor.getName().toLowerCase(Locale.ROOT));
    PlayerRoute ownerRoute = routesByUsername.get(ownerName.toLowerCase(Locale.ROOT));
    if (visitorRoute == null || ownerRoute == null) {
      visitor.sendMessage(Component.text("Both players must be mapped by an instructor."));
      return;
    }
    WorldLease ownerLease = leasesByOwner.get(ownerRoute.ownerKey());
    if (ownerLease == null || ownerLease.ownerPlayerId == null) {
      visitor.sendMessage(Component.text("That owner’s world is not currently running."));
      return;
    }
    if (!ownerLease.approvedVisitorNames.remove(
        visitorRoute.minecraftUsername().toLowerCase(Locale.ROOT))) {
      visitor.sendMessage(Component.text("The owner has not approved this visit."));
      return;
    }
    removeVisitorAssignment(visitor.getUniqueId());
    ownerLease.visitorIds.add(visitor.getUniqueId());
    visitorOwnerByPlayer.put(visitor.getUniqueId(), ownerRoute.ownerKey());
    visitor.teleport(spawn(ownerLease.world));
    visitor.sendMessage(
        Component.text("You are visiting " + ownerRoute.minecraftUsername() + "’s world."));
  }

  private WorldLease ensureLease(PlayerRoute route) {
    UUID pending = unloadTokens.remove(route.ownerKey());
    if (pending != null) {
      plugin
          .getLogger()
          .info("Cancelled pending unload because camper reconnected: " + route.ownerKey());
    }
    WorldLease existing = leasesByOwner.get(route.ownerKey());
    if (existing != null) return existing;
    if (leasesByOwner.size() >= MAX_ACTIVE_CAMPER_WORLDS) {
      throw new IllegalStateException("This Host has reached its 25-camper world limit.");
    }
    String worldName = privateWorldName(route.sessionId(), route.camperId());
    WorldLease lease = new WorldLease(route, loadWorkingWorld(worldName, route.ownerKey()));
    leasesByOwner.put(route.ownerKey(), lease);
    return lease;
  }

  private void releaseOwner(WorldLease lease) {
    leasesByOwner.remove(lease.route.ownerKey());
    gateway.stopStudent(
        lease.route.sessionId(), lease.route.projectId(), lease.route.camperId());
    for (UUID visitorId : List.copyOf(lease.visitorIds)) {
      Player visitor = plugin.getServer().getPlayer(visitorId);
      removeVisitorAssignment(visitorId);
      if (visitor != null && visitor.isOnline()) {
        PlayerRoute route =
            routesByUsername.get(visitor.getName().toLowerCase(Locale.ROOT));
        if (route == null) {
          visitor.teleport(spawn(world()));
        } else {
          WorldLease ownLease = ensureLease(route);
          ownLease.ownerPlayerId = visitor.getUniqueId();
          visitor.teleport(spawn(ownLease.world));
        }
        visitor.sendMessage(Component.text("The owner left, so the visit ended safely."));
      }
    }
    scheduleSafeUnload(lease.route.ownerKey(), lease.world, 0);
  }

  private void scheduleSafeUnload(String ownerKey, World target, int attempt) {
    UUID token = unloadTokens.computeIfAbsent(ownerKey, ignored -> UUID.randomUUID());
    plugin
        .getServer()
        .getScheduler()
        .runTaskLater(
            plugin,
            () -> {
              synchronized (this) {
                if (!token.equals(unloadTokens.get(ownerKey))
                    || leasesByOwner.containsKey(ownerKey)) return;
                if (!target.getPlayers().isEmpty() && attempt < 10) {
                  scheduleSafeUnload(ownerKey, target, attempt + 1);
                  return;
                }
                if (!target.getPlayers().isEmpty()) {
                  plugin
                      .getLogger()
                      .warning("Private world remained occupied and was not unloaded: " + ownerKey);
                  unloadTokens.remove(ownerKey);
                  return;
                }
                target.save();
                if (!plugin.getServer().unloadWorld(target, true)) {
                  plugin.getLogger().warning("Paper refused to unload private world: " + ownerKey);
                }
                unloadTokens.remove(ownerKey);
              }
            },
            2L);
  }

  private void removeVisitorAssignment(UUID playerId) {
    String ownerKey = visitorOwnerByPlayer.remove(playerId);
    if (ownerKey == null) return;
    WorldLease ownerLease = leasesByOwner.get(ownerKey);
    if (ownerLease != null) ownerLease.visitorIds.remove(playerId);
  }

  private WorldLease leaseForPlayer(UUID playerId) {
    String visitorOwner = visitorOwnerByPlayer.get(playerId);
    if (visitorOwner != null) return leasesByOwner.get(visitorOwner);
    for (WorldLease lease : leasesByOwner.values()) {
      if (playerId.equals(lease.ownerPlayerId)) return lease;
    }
    return null;
  }

  private World loadWorkingWorld(String worldName, String ownerKey) {
    Path worldDirectory =
        plugin.getServer().getWorldContainer().toPath().resolve(worldName);
    boolean existedBeforeLoad = Files.isDirectory(worldDirectory);
    World loaded =
        new WorldCreator(worldName)
            .type(WorldType.FLAT)
            .generateStructures(false)
            .createWorld();
    if (loaded == null) throw new IllegalStateException("Sheep City world could not be created.");
    configureWorld(loaded);
    boolean markerPresent =
        loaded
            .getPersistentDataContainer()
            .has(layoutInitializedKey, PersistentDataType.BYTE);
    if (shouldBuildLayout(existedBeforeLoad, markerPresent)) {
      buildLayout(loaded);
      plugin.getLogger().info("Created original Sheep City layout for " + ownerKey + ".");
    }
    loaded
        .getPersistentDataContainer()
        .set(layoutInitializedKey, PersistentDataType.BYTE, (byte) 1);
    loaded.save();
    return loaded;
  }

  private void configureWorld(World target) {
    target.setAutoSave(true);
    target.setSpawnLocation(0, 65, 0);
    target.getWorldBorder().setCenter(0, 0);
    target.getWorldBorder().setSize(192);
    target.setGameRule(GameRules.SPAWN_MOBS, false);
    target.setGameRule(GameRules.ADVANCE_TIME, false);
    target.setTime(6000);
    for (int chunkX = -1; chunkX <= 1; chunkX++) {
      for (int chunkZ = -1; chunkZ <= 1; chunkZ++) {
        target.getChunkAt(chunkX, chunkZ).load();
      }
    }
  }

  private boolean isManagedWorld(World candidate) {
    if (candidate.equals(world())) return true;
    return leasesByOwner.values().stream().anyMatch(lease -> lease.world.equals(candidate));
  }

  private static void validateRoute(PlayerRoute route) {
    if (route.organizationId().isBlank()
        || route.locationId().isBlank()
        || route.sessionId().isBlank()
        || route.camperId().isBlank()
        || !route.projectId().equals("sheep-city")
        || !route.minecraftUsername().matches("[A-Za-z0-9_]{3,16}")) {
      throw new IllegalArgumentException("Host supplied an invalid player route.");
    }
  }

  static String privateWorldName(String sessionId, String camperId) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] bytes =
          digest.digest((sessionId + ":" + camperId).getBytes(StandardCharsets.UTF_8));
      return "bb_sc_" + HexFormat.of().formatHex(bytes, 0, 16);
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 is unavailable.", exception);
    }
  }

  private static Location spawn(World target) {
    return new Location(target, 0.5, 65, 0.5, 90, 0);
  }

  private void giveTestKit(Player player) {
    if (!player.getInventory().contains(Material.BOW)) {
      player.getInventory().addItem(new ItemStack(Material.BOW));
    }
    if (!player.getInventory().contains(Material.ARROW)) {
      player.getInventory().addItem(new ItemStack(Material.ARROW, 64));
    }
    if (!player.getInventory().contains(Material.IRON_SWORD)) {
      player.getInventory().addItem(new ItemStack(Material.IRON_SWORD));
    }
    if (!player.getInventory().contains(Material.COOKED_BEEF)) {
      player.getInventory().addItem(new ItemStack(Material.COOKED_BEEF, 16));
    }
  }

  private void buildLayout(World target) {
    fill(target, -7, 63, -7, 7, 63, 7, Material.STONE_BRICKS);
    fill(target, -3, 64, -3, 3, 64, 3, Material.GOLD_BLOCK);
    fill(target, -1, 64, -1, 1, 64, 1, Material.LAPIS_BLOCK);

    fill(target, 10, 63, -4, 42, 63, 4, Material.SMOOTH_STONE);
    fill(target, 42, 64, -4, 42, 70, 4, Material.WHITE_CONCRETE);
    fill(target, 42, 66, -1, 42, 68, 1, Material.RED_CONCRETE);
    for (int x = 10; x <= 42; x += 4) {
      target.getBlockAt(x, 64, -4).setType(Material.OAK_FENCE);
      target.getBlockAt(x, 64, 4).setType(Material.OAK_FENCE);
    }

    fill(target, -22, 63, -5, -9, 63, 8, Material.GRASS_BLOCK);
    for (int x = -22; x <= -9; x++) {
      target.getBlockAt(x, 64, -5).setType(Material.OAK_FENCE);
      target.getBlockAt(x, 64, 8).setType(Material.OAK_FENCE);
    }
    for (int z = -5; z <= 8; z++) {
      target.getBlockAt(-22, 64, z).setType(Material.OAK_FENCE);
      target.getBlockAt(-9, 64, z).setType(Material.OAK_FENCE);
    }
    target.getBlockAt(-9, 64, 1).setType(Material.OAK_FENCE_GATE);

    fill(target, -5, 64, 14, 5, 70, 20, Material.LIGHT_BLUE_CONCRETE);
    fill(target, -4, 65, 13, -2, 67, 13, Material.GLASS);
    fill(target, 2, 65, 13, 4, 67, 13, Material.GLASS);
  }

  private static void fill(
      World target,
      int x1,
      int y1,
      int z1,
      int x2,
      int y2,
      int z2,
      Material material) {
    for (int x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      for (int y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (int z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) {
          target.getBlockAt(x, y, z).setType(material, false);
        }
      }
    }
  }

  synchronized List<String> activePrivateWorldNames() {
    List<String> names = new ArrayList<>();
    for (WorldLease lease : leasesByOwner.values()) names.add(lease.world.getName());
    return names;
  }
}
