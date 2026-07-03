import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/assessments/$id")({
  component: () => <Outlet />,
});
