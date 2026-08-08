import { beforeEach, describe, expect, it, vi } from "vitest";
import { mediaApi } from "../../src/entities/media/api/mediaApi.js";
import {
  pollMedia,
  pollRevision,
  prepareRevision,
  uploadMedia,
} from "../../src/features/media/model/mediaOrchestrator.js";

describe("Media V2 orchestration", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("0.5초부터 최대 5초까지 backoff하며 READY를 반환한다", async () => {
    let time = 0;
    const delays = [];
    const get = vi
      .fn()
      .mockResolvedValueOnce({ status: "PROCESSING" })
      .mockResolvedValueOnce({ status: "PROCESSING" })
      .mockResolvedValueOnce({ status: "READY", mediaId: "media-1" });

    const result = await pollMedia("media-1", {
      now: () => time,
      sleep: async (delay) => {
        delays.push(delay);
        time += delay;
      },
      get,
    });

    expect(delays).toEqual([500, 1000, 2000]);
    expect(result.status).toBe("READY");
  });

  it("FAILED와 60초 timeout을 서로 다른 오류 코드로 반환한다", async () => {
    await expect(
      pollMedia("failed", {
        sleep: async () => {},
        get: async () => ({ status: "FAILED", errorCode: "CORRUPTED_IMAGE" }),
      }),
    ).rejects.toMatchObject({ code: "CORRUPTED_IMAGE" });

    let time = 0;
    await expect(
      pollMedia("timeout", {
        timeoutMs: 1_000,
        now: () => time,
        sleep: async (delay) => {
          time += delay;
        },
        get: async () => ({ status: "PROCESSING" }),
      }),
    ).rejects.toMatchObject({ code: "MEDIA_PROCESSING_TIMEOUT" });
  });

  it("원본 File을 Presigned POST에 전달하고 complete 뒤 polling한다", async () => {
    const file = new File(["source"], "source.png", { type: "image/png" });
    vi.spyOn(mediaApi, "initiate").mockResolvedValue({
      mediaId: "media-2",
      upload: { url: "https://upload.example", fields: { key: "source" } },
    });
    vi.spyOn(mediaApi, "uploadToPresignedPost").mockResolvedValue();
    vi.spyOn(mediaApi, "complete").mockResolvedValue({ status: "PROCESSING" });
    vi.spyOn(mediaApi, "get").mockResolvedValue({
      mediaId: "media-2",
      status: "READY",
    });

    const result = await uploadMedia(
      file,
      {
        purpose: "POST",
        frame: "POST_LANDSCAPE",
        rotation: 90,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      },
      {},
    );

    expect(mediaApi.uploadToPresignedPost).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ url: "https://upload.example" }),
      undefined,
    );
    expect(result.status).toBe("READY");
  }, 10_000);

  it("Revision은 새 원본 업로드 없이 READY까지 polling한다", async () => {
    vi.spyOn(mediaApi, "initiate").mockRejectedValue(
      new Error("Revision 처리에서는 호출하면 안 됩니다."),
    );
    vi.spyOn(mediaApi, "createRevision").mockResolvedValue({
      mediaId: "media-3",
      revision: 2,
      status: "PROCESSING",
    });
    vi.spyOn(mediaApi, "getRevision").mockResolvedValue({
      mediaId: "media-3",
      revision: 2,
      status: "READY",
      variants: [],
    });

    const result = await prepareRevision("media-3", {
      frame: "POST_LANDSCAPE",
      crop: { x: 0, y: 0, width: 1, height: 1 },
      zoom: 1.5,
      position: { x: 0.5, y: 0.5 },
    });

    expect(mediaApi.createRevision).toHaveBeenCalledWith(
      "media-3",
      expect.objectContaining({ zoom: 1.5 }),
      { signal: undefined },
    );
    expect(mediaApi.initiate).not.toHaveBeenCalled();
    expect(result.status).toBe("READY");
  }, 10_000);

  it("Revision FAILED와 timeout을 구분한다", async () => {
    await expect(
      pollRevision("media", 2, {
        sleep: async () => {},
        get: async () => ({ status: "FAILED", errorCode: "INVALID_CROP" }),
      }),
    ).rejects.toMatchObject({ code: "INVALID_CROP" });

    let time = 0;
    await expect(
      pollRevision("media", 2, {
        timeoutMs: 1_000,
        now: () => time,
        sleep: async (delay) => {
          time += delay;
        },
        get: async () => ({ status: "PROCESSING" }),
      }),
    ).rejects.toMatchObject({ code: "MEDIA_REVISION_PROCESSING_TIMEOUT" });
  });
});
