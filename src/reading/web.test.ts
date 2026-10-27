import { describe, expect, it } from "vitest";
import { videoOf, vimeoId, youtubeId } from "./web";

describe("Videos of web addresses", () => {
  it("recognises YouTube videos", () => {
    for (const url of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42", "https://youtu.be/dQw4w9WgXcQ", "https://m.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]) expect(youtubeId(url)).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/channel/UC123")).toBeNull();
    expect(youtubeId("https://vimeo.com/123")).toBeNull();
    expect(youtubeId("pas une adresse")).toBeNull();
  });

  it("recognises Vimeo videos", () => {
    expect(vimeoId("https://vimeo.com/76979871")).toBe("76979871");
    expect(vimeoId("https://player.vimeo.com/video/76979871?h=1")).toBe("76979871");
    expect(vimeoId("https://vimeo.com/channels/staffpicks")).toBeNull();
  });

  it("gives the player and the thumbnail", () => {
    expect(videoOf("https://youtu.be/dQw4w9WgXcQ")).toEqual({ player: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" });
    expect(videoOf("https://vimeo.com/76979871")?.player).toBe("https://player.vimeo.com/video/76979871?dnt=1");
    expect(videoOf("https://example.com/image.png")).toBeNull();
  });
});
