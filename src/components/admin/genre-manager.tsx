"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { slugify } from "@/lib/utils/format";
import type { Genre } from "@/types/db";

export function GenreManager({ genres }: { genres: Genre[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Genre | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, method: string, body?: object) {
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Thao tác thất bại.");
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="max-w-xl space-y-4">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await send("/api/admin/genres", "POST", { name, slug: slugify(name) })) setName("");
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên thể loại mới" required />
        <Button type="submit">Thêm</Button>
      </form>
      {error && <Alert tone="error">{error}</Alert>}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {genres.map((g) => (
          <li key={g.id} className="flex items-center gap-2 p-2">
            {editing?.id === g.id ? (
              <>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                <Button size="icon" variant="ghost" onClick={async () => (await send(`/api/admin/genres/${g.id}`, "PATCH", { name: editing.name, slug: g.slug })) && setEditing(null)}><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{g.name} <span className="text-xs text-muted-foreground">/{g.slug}</span></span>
                <Button size="icon" variant="ghost" onClick={() => setEditing(g)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => confirm(`Xóa thể loại “${g.name}”?`) && send(`/api/admin/genres/${g.id}`, "DELETE")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
