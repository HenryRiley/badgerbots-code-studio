package org.badgerbots.studio.paper;

import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.entity.Projectile;
import org.bukkit.entity.Sheep;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.world.WorldUnloadEvent;
import org.bukkit.projectiles.ProjectileSource;

final class PaperEventRouter implements Listener {
  private final PaperRuntimeGateway gateway;

  PaperEventRouter(PaperRuntimeGateway gateway) {
    this.gateway = gateway;
  }

  @EventHandler(ignoreCancelled = true)
  public void onProjectileHit(ProjectileHitEvent event) {
    Projectile projectile = event.getEntity();
    ProjectileSource shooter = projectile.getShooter();
    if (!(shooter instanceof Player player)) return;
    Location location =
        event.getHitBlock() != null
            ? event.getHitBlock().getLocation().add(0.5, 0.5, 0.5)
            : projectile.getLocation();
    gateway.projectileHit(player.getUniqueId(), location);
  }

  @EventHandler(ignoreCancelled = true)
  public void onPlayerMove(PlayerMoveEvent event) {
    if (event.getTo() == null) return;
    if (event.getFrom().getBlockX() == event.getTo().getBlockX()
        && event.getFrom().getBlockY() == event.getTo().getBlockY()
        && event.getFrom().getBlockZ() == event.getTo().getBlockZ()) return;
    gateway.playerMove(event.getPlayer().getUniqueId(), event.getTo());
  }

  @EventHandler(ignoreCancelled = true)
  public void onSheepDeath(EntityDeathEvent event) {
    if (event.getEntity() instanceof Sheep sheep) {
      gateway.sheepDeath(sheep.getUniqueId(), sheep.getLocation());
    }
  }

  @EventHandler
  public void onPlayerQuit(PlayerQuitEvent event) {
    gateway.stopPlayer(event.getPlayer().getUniqueId());
  }

  @EventHandler
  public void onWorldUnload(WorldUnloadEvent event) {
    gateway.stopWorld(event.getWorld().getUID());
  }
}
