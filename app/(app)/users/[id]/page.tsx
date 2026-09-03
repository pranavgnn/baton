import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { can, forbidden, requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  application,
  role,
  school,
  schoolAssociateDean,
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
      schoolId: user.schoolId,
      schoolName: school.name,
      designation: user.designation,
      institution: user.institution,
      userType: user.userType,
      dateOfBirth: user.dateOfBirth,
      dateOfJoining: user.dateOfJoining,
      dateOfLastPromotion: user.dateOfLastPromotion,
      phone: user.phone,
      personalEmail: user.personalEmail,
      address: user.address,
      activated: user.activated,
      disabled: user.disabled,
      createdAt: user.createdAt,
    })
    .from(user)
    .leftJoin(school, eq(school.id, user.schoolId))
    .where(eq(user.id, id));

  if (!userRecord) {
    notFound();
  }

  const [userRoles, userApps, asDean, asAssociate, allRoles, allSchools] =
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
        .select({ name: school.name })
        .from(school)
        .where(eq(school.deanId, id)),
      db
        .select({ name: school.name })
        .from(schoolAssociateDean)
        .innerJoin(school, eq(school.id, schoolAssociateDean.schoolId))
        .where(eq(schoolAssociateDean.userId, id)),
      canManage
        ? db
            .select({ id: role.id, name: role.name })
            .from(role)
            .orderBy(role.priority, role.name)
        : Promise.resolve([]),
      canManage
        ? db
            .select({ id: school.id, name: school.name })
            .from(school)
            .orderBy(school.name)
        : Promise.resolve([]),
    ]);

  const signsFor = [
    ...asDean.map((r) => `Dean of ${r.name}`),
    ...asAssociate.map((r) => `Associate dean of ${r.name}`),
  ];

  const profileData = {
    id: userRecord.id,
    name: userRecord.name,
    email: userRecord.email,
    employeeId: userRecord.employeeId ?? "",
    schoolId: userRecord.schoolId ?? "",
    schoolName: userRecord.schoolName ?? "",
    designation: userRecord.designation ?? "",
    institution: userRecord.institution ?? "",
    userType: userRecord.userType ?? "",
    dateOfBirth: userRecord.dateOfBirth ?? "",
    dateOfJoining: userRecord.dateOfJoining ?? "",
    dateOfLastPromotion: userRecord.dateOfLastPromotion ?? "",
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
      allSchools={allSchools}
      canManage={canManage}
      currentUserId={current.id}
    />
  );
}
