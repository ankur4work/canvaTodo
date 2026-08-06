import type { TrackingId, TrackingSession } from "@canva/user";
import { monetization } from "@canva/user";
import { runBillableAction } from "../run_billable_action";

describe("runBillableAction", () => {
  const closeTrackingSession = jest.fn<Promise<void>, []>();

  beforeEach(() => {
    jest.resetAllMocks();
    closeTrackingSession.mockResolvedValue(undefined);

    jest.mocked(monetization.openTrackingSession).mockResolvedValue({
      id: "session-1" as TrackingId,
      closeTrackingSession,
    } satisfies TrackingSession);
  });

  it("opens a session for the action and hands its id to the work", async () => {
    const work = jest.fn().mockResolvedValue("generated");

    const result = await runBillableAction("generate_image", work);

    expect(monetization.openTrackingSession).toHaveBeenCalledWith({
      action: "generate_image",
    });
    expect(work).toHaveBeenCalledWith("session-1");
    expect(result).toBe("generated");
  });

  it("closes the session after successful work", async () => {
    await runBillableAction("generate_image", jest.fn().mockResolvedValue(1));

    expect(closeTrackingSession).toHaveBeenCalledTimes(1);
  });

  it("closes the session even when the work throws", async () => {
    const work = jest.fn().mockRejectedValue(new Error("provider exploded"));

    await expect(runBillableAction("generate_image", work)).rejects.toThrow(
      "provider exploded",
    );

    // A session left open would keep reporting usage that never happened.
    expect(closeTrackingSession).toHaveBeenCalledTimes(1);
  });
});
