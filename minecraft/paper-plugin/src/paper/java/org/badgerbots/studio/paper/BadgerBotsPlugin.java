package org.badgerbots.studio.paper;

import org.badgerbots.studio.runtime.AtomicProgramRuntime;
import org.badgerbots.studio.runtime.ExecutionScopeRegistry;
import org.bukkit.plugin.java.JavaPlugin;

/** Paper lifecycle boundary. Host pairing and command delivery are installed in the next slice. */
public final class BadgerBotsPlugin extends JavaPlugin {
  private ExecutionScopeRegistry scopes;
  private AtomicProgramRuntime runtime;
  private PaperRuntimeGateway gateway;

  @Override
  public void onEnable() {
    scopes = new ExecutionScopeRegistry();
    runtime = new AtomicProgramRuntime(new PaperGameAdapter(this), scopes);
    gateway = new PaperRuntimeGateway(runtime);
    getServer().getPluginManager().registerEvents(new PaperEventRouter(gateway), this);
    getLogger().info(
        "BadgerBots scoped runtime loaded. No student program runs until an authenticated Host deploys one.");
  }

  @Override
  public void onDisable() {
    if (runtime != null) runtime.stopAll();
    if (scopes != null) scopes.stopAll();
  }

  public PaperRuntimeGateway runtimeGateway() {
    if (gateway == null) throw new IllegalStateException("BadgerBots runtime is not enabled.");
    return gateway;
  }
}
