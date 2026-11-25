"use client";

import {
  BellIcon,
  CircleAlertIcon,
  HouseIcon,
  LogOutIcon,
  SearchIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { apiFormErrors } from "../lib/form-errors";
import { leaveTo } from "../lib/navigation";
import { useUnreadCount } from "../lib/notifications";
import { useLogOut, useSession } from "../lib/session";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";

/**
 * Primary navigation for the app pages (home and profiles). Members get Home,
 * their profile, and Log out; signed-out visitors reading a public profile get
 * Log in and Create account. The current page is marked with aria-current.
 */
export function AppHeader() {
  const pathname = usePathname();
  const session = useSession();
  const logOut = useLogOut();
  const [error, setError] = useState<string | null>(null);
  const user = session.data?.user ?? null;
  const unread = useUnreadCount(user?.id ?? null).data?.unreadCount ?? 0;

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6">
        <Link
          className="font-bold text-foreground no-underline"
          href={user === null ? "/" : "/home"}
        >
          Twitter Clone
        </Link>

        {session.isPending ? null : user === null ? (
          <nav aria-label="Account" className="flex items-center gap-2">
            <Link
              className={buttonVariants({ size: "sm", variant: "ghost" })}
              href="/login"
            >
              Log in
            </Link>
            <Link className={buttonVariants({ size: "sm" })} href="/register">
              Create account
            </Link>
          </nav>
        ) : (
          <div className="flex items-center gap-1">
            <NavigationMenu aria-label="Primary">
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    className="no-underline"
                    active={pathname === "/home"}
                    render={<Link href="/home" />}
                  >
                    <HouseIcon aria-hidden="true" />
                    Home
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    className="no-underline"
                    active={pathname === "/search"}
                    render={<Link href="/search" />}
                  >
                    <SearchIcon aria-hidden="true" />
                    Search
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    active={pathname === "/notifications"}
                    aria-label={
                      unread > 0
                        ? `Notifications, ${unread} unread`
                        : "Notifications"
                    }
                    className="relative no-underline"
                    render={<Link href="/notifications" />}
                  >
                    <BellIcon aria-hidden="true" />
                    {/* Icon only on phones, where the header has no room. */}
                    <span className="hidden md:inline">Notifications</span>
                    {unread > 0 ? (
                      <Badge
                        aria-hidden="true"
                        className="absolute -top-1 left-4 h-4 min-w-4 px-1 text-[0.65rem] tabular-nums md:static"
                      >
                        {unread > 99 ? "99+" : unread}
                      </Badge>
                    ) : null}
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    className="no-underline"
                    active={pathname === `/u/${user.username}`}
                    render={<Link href={`/u/${user.username}`} />}
                  >
                    <UserRoundIcon aria-hidden="true" />
                    Profile
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
            <Button
              aria-busy={logOut.isPending}
              disabled={logOut.isPending}
              onClick={() =>
                logOut.mutate(undefined, {
                  onError: (failure) => setError(apiFormErrors(failure).form),
                  onSuccess: () => leaveTo("/"),
                })
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              <LogOutIcon aria-hidden="true" data-icon="inline-start" />
              {logOut.isPending ? "Logging out…" : "Log out"}
            </Button>
          </div>
        )}
      </div>
      {error === null ? null : (
        <div className="mx-auto w-full max-w-2xl px-3 pb-2 sm:px-6">
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
    </header>
  );
}
