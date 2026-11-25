import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useHydrated } from "./use-hydrated";

function Probe() {
  return <p>{useHydrated() ? "client" : "server"}</p>;
}

describe("useHydrated", () => {
  it("is false in server HTML and true once mounted in the browser", () => {
    expect(renderToString(<Probe />)).toContain("server");

    render(<Probe />);

    expect(screen.getByText("client")).toBeVisible();
  });
});
