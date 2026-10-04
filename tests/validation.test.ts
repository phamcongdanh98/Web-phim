import { describe, expect, it } from "vitest";
import { movieInputSchema, genreSchema } from "@/lib/validation/movie";
import { createUserSchema, progressSchema, updateUserSchema } from "@/lib/validation/user";
import { isAllowedMediaUrl, sanitizeSearch, parseUuid } from "@/lib/validation/common";
import { toVtt } from "@/lib/utils/subtitles";

describe("movieInputSchema", () => {
  const base = { title: "  Phim A ", type: "movie" as const };
  it("normalises empty optionals to null and trims", () => {
    const r = movieInputSchema.parse({ ...base, description: "", director: undefined });
    expect(r).toMatchObject({ title: "Phim A", description: null, director: null, published: false, featured: false, genre_ids: [] });
  });
  it("rejects empty title, bad type, bad year", () => {
    expect(movieInputSchema.safeParse({ ...base, title: " " }).success).toBe(false);
    expect(movieInputSchema.safeParse({ ...base, type: "tv" }).success).toBe(false);
    expect(movieInputSchema.safeParse({ ...base, release_year: 1500 }).success).toBe(false);
  });
  it("rejects poster URLs from unknown hosts (SSRF / tracking pixels)", () => {
    expect(movieInputSchema.safeParse({ ...base, poster_url: "https://evil.example/x.png" }).success).toBe(false);
    expect(movieInputSchema.safeParse({ ...base, poster_url: "https://image.tmdb.org/t/p/w780/a.jpg" }).success).toBe(true);
    expect(movieInputSchema.safeParse({ ...base, poster_url: "javascript:alert(1)" }).success).toBe(false);
  });
  it("rejects non-uuid genre ids", () => {
    expect(movieInputSchema.safeParse({ ...base, genre_ids: ["x"] }).success).toBe(false);
  });
});

describe("misc validation", () => {
  it("genre slug format", () => {
    expect(genreSchema.safeParse({ name: "A", slug: "sci-fi" }).success).toBe(true);
    expect(genreSchema.safeParse({ name: "A", slug: "Sci Fi" }).success).toBe(false);
  });
  it("user schemas", () => {
    expect(createUserSchema.safeParse({ email: "A@B.io", password: "short" }).success).toBe(false);
    expect(createUserSchema.parse({ email: "A@B.io", password: "longenough" }).email).toBe("a@b.io");
    expect(updateUserSchema.safeParse({}).success).toBe(false);
  });
  it("progress schema rejects negatives and NaN", () => {
    expect(progressSchema.safeParse({ positionSeconds: -1, durationSeconds: 10 }).success).toBe(false);
    expect(progressSchema.safeParse({ positionSeconds: NaN, durationSeconds: 10 }).success).toBe(false);
    expect(progressSchema.safeParse({ positionSeconds: 5, durationSeconds: 10 }).success).toBe(true);
  });
  it("sanitizeSearch strips PostgREST filter metacharacters", () => {
    expect(sanitizeSearch("a,b)or(c%*")).not.toMatch(/[,()%*]/);
  });
  it("isAllowedMediaUrl", () => {
    expect(isAllowedMediaUrl("https://x.supabase.co/a.png", ["x.supabase.co"])).toBe(true);
    expect(isAllowedMediaUrl("ftp://x.supabase.co/a", ["x.supabase.co"])).toBe(false);
  });
  it("parseUuid throws 400 on garbage", () => {
    expect(() => parseUuid("../../etc")).toThrow();
  });
  it("toVtt converts SRT timestamps and keeps VTT", () => {
    expect(toVtt("1\n00:00:01,500 --> 00:00:02,000\nHi")).toBe("WEBVTT\n\n1\n00:00:01.500 --> 00:00:02.000\nHi\n");
    expect(toVtt("WEBVTT\n\nx")).toBe("WEBVTT\n\nx\n");
  });
});
