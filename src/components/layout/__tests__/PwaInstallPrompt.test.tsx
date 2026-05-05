import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PwaInstallPrompt } from "@/components/layout/PwaInstallPrompt";

describe("PwaInstallPrompt", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows after beforeinstallprompt and runs prompt on install click", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
    };
    installEvent.prompt = prompt;
    installEvent.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });

    render(<PwaInstallPrompt />);
    expect(screen.queryByText("Install TrendingRepo")).toBeNull();

    window.dispatchEvent(installEvent);
    expect(await screen.findByText("Install TrendingRepo")).toBeTruthy();
    const installCard = screen.getByTestId("pwa-install-prompt");
    expect(installCard.className).toContain("fixed");
    expect(installCard.className).toContain("sm:bottom-6");

    fireEvent.click(screen.getByRole("button", { name: "Install" }));

    await waitFor(() => {
      expect(prompt).toHaveBeenCalledTimes(1);
      expect(window.localStorage.getItem("trendingrepo-pwa-install-dismissed")).toBe("1");
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

  });

  it("does not show when previously dismissed", () => {
    window.localStorage.setItem("trendingrepo-pwa-install-dismissed", "1");

    render(<PwaInstallPrompt />);
    window.dispatchEvent(new Event("beforeinstallprompt"));

    expect(screen.queryByText("Install TrendingRepo")).toBeNull();
  });
});
