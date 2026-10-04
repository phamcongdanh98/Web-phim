"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Film, Menu, Search, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/", label: "Trang chủ", exact: true },
  { href: "/movies", label: "Phim lẻ" },
  { href: "/series", label: "Phim bộ" },
  { href: "/genres", label: "Thể loại" },
  { href: "/favorites", label: "Yêu thích" },
];

export function Header({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initial = (name || "?").charAt(0).toUpperCase();

  const link = (href: string, label: string, exact?: boolean) => {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setOpen(false)}
        className={cn("rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground", active && "font-medium text-foreground")}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-4 sm:px-6">
        <button className="rounded-md p-2 md:hidden" aria-label="Mở menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Film className="h-5 w-5 text-primary" /> Phim Web
        </Link>
        <nav className="ml-4 hidden items-center md:flex">{NAV.map((n) => link(n.href, n.label, n.exact))}</nav>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/search" aria-label="Tìm kiếm" className="rounded-md p-2 hover:bg-muted"><Search className="h-5 w-5" /></Link>
          {isAdmin && <Link href="/admin" aria-label="Quản trị" className="rounded-md p-2 hover:bg-muted"><Settings className="h-5 w-5" /></Link>}
          <details className="relative">
            <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-label="Tài khoản">
              {initial}
            </summary>
            <div className="absolute right-0 mt-2 w-48 rounded-md border border-border bg-card p-2 text-sm shadow-lg">
              <p className="truncate px-2 py-1 text-muted-foreground">{name}</p>
              <form action="/api/auth/logout" method="post">
                <button className="w-full rounded px-2 py-1.5 text-left hover:bg-muted" type="submit">Đăng xuất</button>
              </form>
            </div>
          </details>
        </div>
      </div>
      {open && <nav className="flex flex-col border-t border-border p-2 md:hidden">{NAV.map((n) => link(n.href, n.label, n.exact))}</nav>}
    </header>
  );
}
