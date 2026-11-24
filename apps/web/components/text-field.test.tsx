import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormAlert } from "./form-alert";
import { TextField } from "./text-field";

describe("TextField", () => {
  it("associates the label, hint, and errors with the input", () => {
    render(
      <TextField
        errors={["Must be at least 10 characters."]}
        hint="10–128 characters."
        label="Password"
        name="password"
        type="password"
      />,
    );

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "10–128 characters. Must be at least 10 characters.",
    );
  });

  it("is valid and undescribed without hint or errors", () => {
    render(<TextField label="Email" name="email" />);

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});

describe("FormAlert", () => {
  it("renders the message in an alert region", () => {
    render(<FormAlert message="Invalid email or password." />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid email or password.",
    );
  });
});
