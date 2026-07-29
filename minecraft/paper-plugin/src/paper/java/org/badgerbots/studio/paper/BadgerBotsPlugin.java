package org.badgerbots.studio.paper;

import org.badgerbots.studio.runtime.AtomicProgramRuntime;
import org.badgerbots.studio.runtime.ExecutionScopeRegistry;
import org.bukkit.plugin.java.JavaPlugin;

/** Paper lifecycle boundary for the local Sheep City prototype. */
public final class BadgerBotsPlugin extends JavaPlugin {
  private ExecutionScopeRegistry scopes;
  private AtomicProgramRuntime runtime;
  private PaperRuntimeGateway gateway;
  private SheepCityWorld sheepCityWorld;
  private HostFileBridge hostBridge;

  @Override
  public void onEnable() {
    scopes = new ExecutionScopeRegistry();
    runtime = new AtomicProgramRuntime(new PaperGameAdapter(this), scopes);
    gateway = new PaperRuntimeGateway(runtime);
    getServer().getPluginManager().registerEvents(new PaperEventRouter(gateway), this);
    sheepCityWorld = new SheepCityWorld(this, gateway);
    sheepCityWorld.create();
    getServer().getPluginManager().registerEvents(sheepCityWorld, this);
    if (getCommand("bbvisit") == null) {
      throw new IllegalStateException("BadgerBots visitor command is missing from plugin.yml.");
    }
    getCommand("bbvisit").setExecutor(sheepCityWorld);
    if (getCommand("bbbenchmark") == null) {
      throw new IllegalStateException("BadgerBots benchmark command is missing from plugin.yml.");
    }
    getCommand("bbbenchmark").setExecutor(new PaperCapacityBenchmark(this, gateway));
    hostBridge = HostFileBridge.fromSystemProperties(this, gateway, sheepCityWorld);
    hostBridge.start();
    getLogger().info("BadgerBots Sheep City runtime loaded; waiting for an authenticated Host deployment.");
  }

  @Override
  public void onDisable() {
    if (hostBridge != null) hostBridge.stop();
    if (runtime != null) runtime.stopAll();
    if (scopes != null) scopes.stopAll();
  }

  public PaperRuntimeGateway runtimeGateway() {
    if (gateway == null) throw new IllegalStateException("BadgerBots runtime is not enabled.");
    return gateway;
  }
}
