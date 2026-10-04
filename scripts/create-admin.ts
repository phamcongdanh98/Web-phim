/* Creates (or promotes) an admin account. Run: npm run create-admin */
import { config } from "dotenv";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

config({ path: [".env.local", ".env"] });

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Mute echo while the password is typed.
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
        if (s.includes(question)) process.stdout.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local");
    process.exit(1);
  }
  const email = await ask("Email admin: ");
  const password = await ask("Mật khẩu (>= 8 ký tự): ", true);
  const name = (await ask("Tên hiển thị: ")) || email.split("@")[0];
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    console.error("Email không hợp lệ hoặc mật khẩu quá ngắn.");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  let userId: string | undefined;
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (created.error) {
    // Already exists: promote it and set the new password.
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) {
      console.error("Không tạo được user:", created.error.message);
      process.exit(1);
    }
    userId = existing.id;
    const upd = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (upd.error) {
      console.error("Không cập nhật được mật khẩu:", upd.error.message);
      process.exit(1);
    }
  } else {
    userId = created.data.user.id;
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, email, display_name: name, role: "admin", is_active: true }, { onConflict: "id" });
  if (error) {
    console.error("Không ghi được profile (đã chạy migration chưa?):", error.message);
    process.exit(1);
  }
  console.log(`✅ Admin sẵn sàng: ${email}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
