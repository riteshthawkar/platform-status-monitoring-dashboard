import { notFound } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { getGroupById } from "@/lib/services-config";

export default async function ProjectPage(
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;

  if (!getGroupById(groupId)) {
    notFound();
  }

  return <Dashboard forcedGroupId={groupId} />;
}
