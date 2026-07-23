package org.badgerbots.studio.paper;

import java.util.UUID;
import org.badgerbots.studio.runtime.GameAdapter;
import org.bukkit.DyeColor;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.attribute.Attribute;
import org.bukkit.attribute.AttributeInstance;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Sheep;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.Vector;

final class PaperGameAdapter implements GameAdapter {
  private final JavaPlugin plugin;

  PaperGameAdapter(JavaPlugin plugin) {
    this.plugin = plugin;
  }

  @Override
  public String getMaterialUnderPlayer(ActionContext context) {
    Player player = player(context);
    return player.getLocation().subtract(0, 1, 0).getBlock().getType().name();
  }

  @Override
  public void explodeAtHit(ActionContext context, double power) {
    Location location = eventLocation(context);
    location.getWorld().createExplosion(
        location.getX(),
        location.getY(),
        location.getZ(),
        (float) power,
        false,
        true,
        nullablePlayer(context));
  }

  @Override
  public void setPlayerVerticalVelocity(ActionContext context, double value) {
    Player player = player(context);
    Vector velocity = player.getVelocity();
    player.setVelocity(velocity.setY(value));
  }

  @Override
  public void setSheepColor(ActionContext context, String color) {
    sheep(context).setColor(DyeColor.valueOf(color));
  }

  @Override
  public void setSheepSpeedMultiplier(ActionContext context, double multiplier) {
    Sheep sheep = sheep(context);
    double bounded = Math.max(0.1, Math.min(4.0, multiplier));
    AttributeInstance movementSpeed = sheep.getAttribute(Attribute.MOVEMENT_SPEED);
    if (movementSpeed == null) throw new IllegalStateException("Sheep movement attribute is missing.");
    movementSpeed.setBaseValue(movementSpeed.getDefaultValue() * bounded);
  }

  @Override
  public void dropItem(ActionContext context, String material, int quantity) {
    Sheep sheep = sheep(context);
    sheep.getWorld().dropItemNaturally(
        sheep.getLocation(), new ItemStack(Material.valueOf(material), quantity));
  }

  private World world(ActionContext context) {
    World world = plugin.getServer().getWorld(UUID.fromString(context.scope().worldId()));
    if (world == null) throw new IllegalStateException("Scoped Paper world is not loaded.");
    return world;
  }

  private Player nullablePlayer(ActionContext context) {
    String playerId = context.event().playerId();
    if (playerId == null) return null;
    Player player = plugin.getServer().getPlayer(UUID.fromString(playerId));
    if (player == null || !player.getWorld().getUID().toString().equals(context.scope().worldId())) {
      throw new IllegalStateException("Player is outside the execution scope.");
    }
    return player;
  }

  private Player player(ActionContext context) {
    Player player = nullablePlayer(context);
    if (player == null) throw new IllegalStateException("Scoped player is unavailable.");
    return player;
  }

  private Sheep sheep(ActionContext context) {
    String sheepId = context.event().sheepId();
    if (sheepId == null) throw new IllegalStateException("Scoped sheep is unavailable.");
    Entity entity = plugin.getServer().getEntity(UUID.fromString(sheepId));
    if (!(entity instanceof Sheep sheep)
        || !sheep.getWorld().getUID().toString().equals(context.scope().worldId())) {
      throw new IllegalStateException("Sheep is outside the execution scope.");
    }
    return sheep;
  }

  private Location eventLocation(ActionContext context) {
    return new Location(
        world(context),
        context.event().x(),
        context.event().y(),
        context.event().z());
  }
}
