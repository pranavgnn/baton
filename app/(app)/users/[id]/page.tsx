import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { can, forbidden, requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  application,
  role,
  department,
  departmentDeputy,
  user,
  userRole,
} from "@/lib/db/schema";
import { nodeById } from "@/lib/workflow/graph";
import { UserProfileView } from "./user-profile-view";

export async function generateMetadata({
  params,
}: PageProps<"/users/[id]">): Promise<Metadata> {
  const { id } = await params;
  const [userRecord] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, id));

  return {
    title: userRecord ? `${userRecord.name} - Profile` : "User Profile",
  };
}

export default async function UserProfilePage({
  params,
}: PageProps<"/users/[id]">) {
  const current = await requireUser();
  const { id } = await params;

  const isSelf = current.id === id;
  const canManage = can(current, "users.manage");

  if (!isSelf && !canManage) {
    forbidden();
  }

  const [userRecord] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      employeeId: user.employeeId,
      departmentId: user.departmentId,
      departmentName: department.name,
      designation: user.designation,
      institution: user.institution,
      userType: user.userType,
      dateOfBirth: user.dateOfBirth,
      dateOfJoining: user.dateOfJoining,
      phone: user.phone,
      personalEmail: user.personalEmail,
      address: user.address,
      activated: user.activated,
      disabled: user.disabled,
      createdAt: user.createdAt,
    })
    .from(user)
    .leftJoin(department, eq(department.id, user.departmentId))
    .where(eq(user.id, id));

  if (!userRecord) {
    notFound();
  }

  const [userRoles, userApps, asHead, asAssociate, allRoles, allDepartments] =
    await Promise.all([
      db
        .select({ id: role.id, name: role.name })
        .from(userRole)
        .innerJoin(role, eq(role.id, userRole.roleId))
        .where(eq(userRole.userId, id)),
      db
        .select()
        .from(application)
        .where(eq(application.applicantId, id))
        .orderBy(desc(application.createdAt)),
      db
        .select({ name: department.name })
        .from(department)
        .where(eq(department.headId, id)),
      db
        .select({ name: department.name })
        .from(departmentDeputy)
        .innerJoin(department, eq(department.id, departmentDeputy.departmentId))
        .where(eq(departmentDeputy.userId, id)),
      canManage
        ? db
            .select({ id: role.id, name: role.name })
            .from(role)
            .orderBy(role.priority, role.name)
        : Promise.resolve([]),
      canManage
        ? db
            .select({ id: department.id, name: department.name })
            .from(department)
            .orderBy(department.name)
        : Promise.resolve([]),
    ]);

  const signsFor = [
    ...asHead.map((r) => `Head of ${r.name}`),
    ...asAssociate.map((r) => `Associate head of ${r.name}`),
  ];

  const profileData = {
    id: userRecord.id,
    name: userRecord.name,
    email: userRecord.email,
    employeeId: userRecord.employeeId ?? "",
    departmentId: userRecord.departmentId ?? "",
    departmentName: userRecord.departmentName ?? "",
    designation: userRecord.designation ?? "",
    institution: userRecord.institution ?? "",
    userType: userRecord.userType ?? "",
    dateOfBirth: userRecord.dateOfBirth ?? "",
    dateOfJoining: userRecord.dateOfJoining ?? "",
    phone: userRecord.phone ?? "",
    personalEmail: userRecord.personalEmail ?? "",
    address: userRecord.address ?? "",
    activated: userRecord.activated,
    disabled: userRecord.disabled,
    createdAt: userRecord.createdAt.toISOString(),
    roles: userRoles,
    signsFor,
    applications: userApps.map((app) => ({
      id: app.id,
      reference: app.reference,
      status: app.status,
      stageLabel: nodeById(app.graph, app.currentNodeId)?.data.label ?? "",
      createdAt: app.createdAt.toISOString(),
      submittedAt: app.submittedAt?.toISOString() ?? null,
      completedAt: app.completedAt?.toISOString() ?? null,
    })),
  };

  return (
    <UserProfileView
      user={profileData}
      allRoles={allRoles}
      allDepartments={allDepartments}
      canManage={canManage}
      currentUserId={current.id}
    />
  );
}
