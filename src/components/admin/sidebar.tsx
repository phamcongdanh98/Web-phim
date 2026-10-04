"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, HardDrive, LayoutDashboard, ScrollText, Settings, Tags, Users, ArrowLeft, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/movies", label: "Phim", icon: Clapperboard },
  { href: "/admin/genres", label: "Thể loại", icon: Tags },
  { href: "/admin/drive", label: "Google Drive", icon: HardDrive },
  { href: "/admin/upload", label: "Tải lên", icon: UploadCloud },
  { href: "/admin/users", label: "Người dùng", icon: Users },
  { href: "/admin/logs", label: "Nhật ký", icon: ScrollText },
  { href: "/admin/settings", label: "Cài đặt", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col md:p-3">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
              active && "bg-muted font-medium text-primary",
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </Link>
        );
      })}
      <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted md:mt-4">
        <ArrowLeft className="h-4 w-4" /> Về trang xem phim
      </Link>
    </nav>
  );
}
