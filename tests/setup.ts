import { randomBytes } from "node:crypto";

// Fake, test-only values. Never real credentials.
process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
process.env.GOOGLE_CLIENT_ID = "client-id-test";
process.env.GOOGLE_CLIENT_SECRET = "client-secret-test";
process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/google/callback";
process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = "root-folder";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
