import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PageHeader } from "../../src/web/features/shared/PageHeader";

describe("PageHeader", () => {
  it("shows a page title and a default home link", () => {
    render(
      <MemoryRouter>
        <PageHeader title="通知规则" description="配置场地可用通知" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "通知规则" })).toBeInTheDocument();
    expect(screen.getByText("配置场地可用通知")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("can show a custom secondary navigation link and page action", () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="编辑规则"
          backTo="/rules"
          backLabel="返回规则列表"
          actions={<a href="/rules/new">新建规则</a>}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "返回规则列表" })).toHaveAttribute(
      "href",
      "/rules",
    );
    expect(screen.getByRole("link", { name: "新建规则" })).toHaveAttribute(
      "href",
      "/rules/new",
    );
  });
});
