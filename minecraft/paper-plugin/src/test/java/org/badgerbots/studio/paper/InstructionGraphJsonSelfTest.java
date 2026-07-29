package org.badgerbots.studio.paper;

import com.google.gson.JsonParser;
import org.badgerbots.studio.runtime.InstructionGraph;

public final class InstructionGraphJsonSelfTest {
  private InstructionGraphJsonSelfTest() {}

  public static void main(String[] args) {
    verifiesNonDestructiveWorldInitialization();
    InstructionGraph graph =
        InstructionGraphJson.decode(
            JsonParser.parseString(
                    """
                    {
                      "graphVersion": 2,
                      "programSchemaVersion": 2,
                      "programId": "program-test",
                      "projectId": "sheep-city",
                      "handlers": [{
                        "sourceNodeId": "event-hit",
                        "event": "projectile_hit",
                        "instructions": [{
                          "sourceNodeId": "explode",
                          "opcode": "explode_at_event_location",
                          "power": 2
                        }]
                      }]
                    }
                    """)
                .getAsJsonObject());
    if (graph.handlers().size() != 1
        || graph.handlers().getFirst().event() != InstructionGraph.EventType.PROJECTILE_HIT) {
      throw new AssertionError("Supported instruction graph did not decode.");
    }

    try {
      InstructionGraphJson.decode(
          JsonParser.parseString(
                  """
                  {
                    "graphVersion": 2,
                    "programSchemaVersion": 2,
                    "programId": "program-test",
                    "projectId": "sheep-city",
                    "handlers": [{
                      "sourceNodeId": "event-hit",
                      "event": "projectile_hit",
                      "instructions": [{
                        "sourceNodeId": "unsafe",
                        "opcode": "run_arbitrary_java"
                      }]
                    }]
                  }
                  """)
              .getAsJsonObject());
      throw new AssertionError("Unsupported opcode was accepted.");
    } catch (IllegalArgumentException expected) {
      if (!expected.getMessage().contains("Unsupported Sheep City instruction")) throw expected;
    }
  }

  private static void verifiesNonDestructiveWorldInitialization() {
    if (!SheepCityWorld.shouldBuildLayout(false, false)) {
      throw new AssertionError("A genuinely new Sheep City world must receive the prototype layout.");
    }
    if (SheepCityWorld.shouldBuildLayout(true, false)) {
      throw new AssertionError("A legacy working world must not be rebuilt on plugin upgrade.");
    }
    if (SheepCityWorld.shouldBuildLayout(true, true)) {
      throw new AssertionError("An initialized working world must preserve student block changes.");
    }
    if (SheepCityWorld.shouldBuildLayout(false, true)) {
      throw new AssertionError("An unexpected existing marker must fail toward preserving blocks.");
    }
    String privateWorld =
        SheepCityWorld.privateWorldName(
            "44444444-4444-4444-8444-444444444444",
            "66666666-6666-4666-8666-666666666666");
    if (!privateWorld.matches("bb_sc_[a-f0-9]{32}")
        || !privateWorld.equals(
            SheepCityWorld.privateWorldName(
                "44444444-4444-4444-8444-444444444444",
                "66666666-6666-4666-8666-666666666666"))) {
      throw new AssertionError("Private world names must be safe and deterministic.");
    }
  }
}
