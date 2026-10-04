import { z } from "zod";
import { isAllowedMediaUrl } from "./common";

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const mediaUrl = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isAllowedMediaUrl(v), "URL ảnh không được phép.");

/** Server-side contract for create/update movie. */
export const movieInputSchema = z.object({
  title: z.string().trim().min(1, "Vui lòng nhập tên phim.").max(200),
  original_title: nullableText(200),
  type: z.enum(["movie", "series"]),
  release_year: z.number().int().min(1880).max(2100).nullish().transform((v) => v ?? null),
  description: nullableText(4000),
  poster_url: mediaUrl,
  backdrop_url: mediaUrl,
  genre_ids: z.array(z.string().uuid()).max(20).default([]),
  director: nullableText(200),
  country: nullableText(100),
  runtime_minutes: z.number().int().min(0).max(10_000).nullish().transform((v) => v ?? null),
  age_rating: nullableText(20),
  tmdb_id: z.number().int().positive().nullish().transform((v) => v ?? null),
  featured: z.boolean().default(false),
  published: z.boolean().default(false),
});
export type MovieInput = z.output<typeof movieInputSchema>;

export const moviePatchSchema = movieInputSchema.partial();

export const genreSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên thể loại.").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug chỉ gồm chữ thường, số và dấu gạch ngang.")
    .max(60),
});

export const episodePatchSchema = z.object({
  title: nullableText(200).optional(),
  description: nullableText(2000).optional(),
  season_number: z.number().int().min(0).max(999).optional(),
  episode_number: z.number().int().min(0).max(9999).optional(),
  published: z.boolean().optional(),
  duration_seconds: z.number().int().min(0).max(1_000_000).nullish().optional(),
});

export const deleteMovieSchema = z.object({ deleteDriveFiles: z.boolean().default(false), confirmDriveDelete: z.boolean().default(false) });
