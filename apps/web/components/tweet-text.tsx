import { mentionSpans } from "@twitter-clone/contracts";
import Link from "next/link";

/**
 * Plain tweet text with @username linked to that profile (US-B05).
 * React escapes the text. A handle that names nobody still links; the profile
 * route is the 404. This does not decide who was notified.
 */
export function TweetText({
  className,
  content,
}: Readonly<{ className?: string; content: string }>) {
  const spans = mentionSpans(content);
  const linked = spans.some((span) => span.kind === "mention");
  return (
    <p className={className}>
      {!linked
        ? content
        : spans.map((span, index) =>
            span.kind === "text" ? (
              <span key={index}>{span.text}</span>
            ) : (
              <Link
                className="text-sky-700 no-underline hover:underline dark:text-sky-400"
                href={`/u/${span.username}`}
                key={index}
              >
                {span.text}
              </Link>
            ),
          )}
    </p>
  );
}
