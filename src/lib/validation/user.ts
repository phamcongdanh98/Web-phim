import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email không hợp lệ."),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự.").max(128),
  display_name: z.string().trim().max(80).optional(),
  role: z.enum(["admin", "user"]).default("user"),
});

export const updateUserSchema = z
  .object({
    is_active: z.boolean().optional(),
    role: z.enum(["admin", "user"]).optional(),
    display_name: z.string().trim().max(80).optional(),
    new_password: z.string().min(8).max(128).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Không có gì để cập nhật.");

export const progressSchema = z.object({
  positionSeconds: z.number().finite().min(0).max(1_000_000),
  durationSeconds: z.number().finite().min(0).max(1_000_000),
});
