package org.badgerbots.studio.paper;

import java.util.Comparator;
import org.bukkit.GameRules;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.WorldCreator;
import org.bukkit.WorldType;
import org.bukkit.entity.Player;
import org.bukkit.entity.Sheep;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;

/** Creates an original compact prototype layout entirely from vanilla blocks. */
final class SheepCityWorld implements Listener {
  static final String WORLD_NAME = "badgerbots_sheep_city_prototype";

  private final JavaPlugin plugin;
  private final PaperRuntimeGateway gateway;
  private final String teacherUsername;
  private World world;

  SheepCityWorld(JavaPlugin plugin, PaperRuntimeGateway gateway) {
    this.plugin = plugin;
    this.gateway = gateway;
    this.teacherUsername = System.getProperty("badgerbots.teacherUsername", "");
  }

  void create() {
    world =
        new WorldCreator(WORLD_NAME)
            .type(WorldType.FLAT)
            .generateStructures(false)
            .createWorld();
    if (world == null) throw new IllegalStateException("Sheep City world could not be created.");
    world.setAutoSave(true);
    world.setSpawnLocation(0, 65, 0);
    world.getWorldBorder().setCenter(0, 0);
    world.getWorldBorder().setSize(192);
    world.setGameRule(GameRules.SPAWN_MOBS, false);
    world.setGameRule(GameRules.ADVANCE_TIME, false);
    world.setTime(6000);
    for (int chunkX = -1; chunkX <= 1; chunkX++) {
      for (int chunkZ = -1; chunkZ <= 1; chunkZ++) world.getChunkAt(chunkX, chunkZ).load();
    }
    buildLayout();
  }

  World world() {
    if (world == null) throw new IllegalStateException("Sheep City world is not loaded.");
    return world;
  }

  Player activePlayer() {
    return world()
        .getPlayers()
        .stream()
        .min(Comparator.comparing(Player::getName))
        .orElseThrow(
            () ->
                new IllegalStateException(
                    "Join the local Minecraft server before clicking Run."));
  }

  Sheep createDemoSheep() {
    Sheep sheep = world().spawn(new Location(world(), -14.5, 65, 3.5), Sheep.class);
    sheep.customName(net.kyori.adventure.text.Component.text("Sheep City Runner"));
    sheep.setCustomNameVisible(true);
    return sheep;
  }

  @EventHandler
  public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    if (!teacherUsername.isBlank() && player.getName().equalsIgnoreCase(teacherUsername)) {
      player.setOp(true);
      player.sendMessage(
          net.kyori.adventure.text.Component.text(
              "Teacher operator controls are enabled for this prototype run."));
    }
    giveTestKit(player);
    player.teleportAsync(spawn());
    player
        .sendMessage(
            net.kyori.adventure.text.Component.text(
                "Welcome to Sheep City. Your test bow, arrows, sword, and food are ready."));
  }

  @EventHandler
  public void onRespawn(PlayerRespawnEvent event) {
    event.setRespawnLocation(spawn());
    giveTestKit(event.getPlayer());
  }

  @EventHandler
  public void onDamage(EntityDamageEvent event) {
    if (event.getEntity() instanceof Player player
        && player.getWorld().equals(world())
        && event.getCause() == EntityDamageEvent.DamageCause.FALL) {
      event.setCancelled(true);
    }
  }

  private Location spawn() {
    return new Location(world(), 0.5, 65, 0.5, 90, 0);
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

  private void buildLayout() {
    // Spawn plaza and modular material-testing pad.
    fill(-7, 63, -7, 7, 63, 7, Material.STONE_BRICKS);
    fill(-3, 64, -3, 3, 64, 3, Material.GOLD_BLOCK);
    fill(-1, 64, -1, 1, 64, 1, Material.LAPIS_BLOCK);

    // Original archery lane east of spawn.
    fill(10, 63, -4, 42, 63, 4, Material.SMOOTH_STONE);
    wall(42, 64, -4, 42, 70, 4, Material.WHITE_CONCRETE);
    fill(42, 66, -1, 42, 68, 1, Material.RED_CONCRETE);
    for (int x = 10; x <= 42; x += 4) {
      world().getBlockAt(x, 64, -4).setType(Material.OAK_FENCE);
      world().getBlockAt(x, 64, 4).setType(Material.OAK_FENCE);
    }

    // Sheep pen west of spawn.
    fill(-22, 63, -5, -9, 63, 8, Material.GRASS_BLOCK);
    for (int x = -22; x <= -9; x++) {
      world().getBlockAt(x, 64, -5).setType(Material.OAK_FENCE);
      world().getBlockAt(x, 64, 8).setType(Material.OAK_FENCE);
    }
    for (int z = -5; z <= 8; z++) {
      world().getBlockAt(-22, 64, z).setType(Material.OAK_FENCE);
      world().getBlockAt(-9, 64, z).setType(Material.OAK_FENCE);
    }
    world().getBlockAt(-9, 64, 1).setType(Material.OAK_FENCE_GATE);

    // Simple skyline provides visual orientation without third-party assets.
    fill(-5, 64, 14, 5, 70, 20, Material.LIGHT_BLUE_CONCRETE);
    fill(-4, 65, 13, -2, 67, 13, Material.GLASS);
    fill(2, 65, 13, 4, 67, 13, Material.GLASS);
  }

  private void fill(
      int x1, int y1, int z1, int x2, int y2, int z2, Material material) {
    for (int x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      for (int y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (int z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) {
          world().getBlockAt(x, y, z).setType(material, false);
        }
      }
    }
  }

  private void wall(
      int x1, int y1, int z1, int x2, int y2, int z2, Material material) {
    fill(x1, y1, z1, x2, y2, z2, material);
  }
}
