import { relations } from "drizzle-orm/relations";
import {
  accounts,
  comments,
  contributorAffiliations,
  contributors,
  contributorsLegacy,
  followers,
  linkedAssets,
  notifications,
  notificationTypes,
  organizations,
  orgFollowers,
  orgPublicationMap,
  orgUserMap,
  publications,
  publicationTags,
  references,
  sessions,
  tempLinks,
  userNotificationSettings,
  users,
  versionReferences,
  versions,
} from "./schema.js";

export const commentsRelations = relations(comments, ({ one, many }) => ({
  publication_publicationIdInt: one(publications, {
    fields: [comments.publicationIdInt],
    references: [publications.idInt],
    relationName: "comments_publicatioIdInt_publications_idInt",
  }),
  publication: one(publications, {
    fields: [comments.publicationId],
    references: [publications.id],
    relationName: "comments_publicationId_publications_id",
  }),
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
    relationName: "comments_userId_users_id",
  }),
  user_userIdInt: one(users, {
    fields: [comments.userIdInt],
    references: [users.idInt],
    relationName: "comments_useIdInt_users_idInt",
  }),
  version: one(versions, {
    fields: [comments.versionId],
    references: [versions.id],
    relationName: "comments_versionId_versions_id",
  }),
  version_versionIdInt: one(versions, {
    fields: [comments.versionIdInt],
    references: [versions.idInt],
    relationName: "comments_versionIdInt_versions_idInt",
  }),
  comment_parentIdInt: one(comments, {
    fields: [comments.parentIdInt],
    references: [comments.idInt],
    relationName: "comments_parenIdInt_comments_idInt",
  }),
  comments_parentIdInt: many(comments, {
    relationName: "comments_parenIdInt_comments_idInt",
  }),
  comment: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "comments_parentId_comments_id",
  }),
  comments: many(comments, {
    relationName: "comments_parentId_comments_id",
  }),
  notifications_commentIdInt: many(notifications, {
    relationName: "notifications_commenIdInt_comments_idInt",
  }),
  notifications: many(notifications, {
    relationName: "notifications_commentId_comments_id",
  }),
}));

export const publicationsRelations = relations(
  publications,
  ({ one, many }) => ({
    comments_publicationIdInt: many(comments, {
      relationName: "comments_publicatioIdInt_publications_idInt",
    }),
    comments: many(comments, {
      relationName: "comments_publicationId_publications_id",
    }),
    contributorsLegacy_publicationIdInt: many(contributorsLegacy, {
      relationName: "contributorsLegacy_publicatioIdInt_publications_idInt",
    }),
    contributorsLegacy: many(contributorsLegacy, {
      relationName: "contributorsLegacy_publicationId_publications_id",
    }),
    notifications_publicationIdInt: many(notifications, {
      relationName: "notifications_publicatioIdInt_publications_idInt",
    }),
    notifications: many(notifications, {
      relationName: "notifications_publicationId_publications_id",
    }),
    orgPublicationMaps_publicationIdInt: many(orgPublicationMap, {
      relationName: "orgPublicationMap_publicatioIdInt_publications_idInt",
    }),
    orgPublicationMaps: many(orgPublicationMap, {
      relationName: "orgPublicationMap_publicationId_publications_id",
    }),
    publicationTags_publicationIdInt: many(publicationTags, {
      relationName: "publicationTags_publicatioIdInt_publications_idInt",
    }),
    publicationTags: many(publicationTags, {
      relationName: "publicationTags_publicationId_publications_id",
    }),
    user: one(users, {
      fields: [publications.ownerId],
      references: [users.id],
      relationName: "publications_ownerId_users_id",
    }),
    user_ownerIdInt: one(users, {
      fields: [publications.ownerIdInt],
      references: [users.idInt],
      relationName: "publications_owneIdInt_users_idInt",
    }),
    versions_publicationIdInt: many(versions, {
      relationName: "versions_publicatioIdInt_publications_idInt",
    }),
    versions: many(versions, {
      relationName: "versions_publicationId_publications_id",
    }),
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  comments: many(comments, {
    relationName: "comments_userId_users_id",
  }),
  comments_userIdInt: many(comments, {
    relationName: "comments_useIdInt_users_idInt",
  }),
  contributorAffiliations: many(contributorAffiliations, {
    relationName: "contributorAffiliations_userId_users_id",
  }),
  contributorAffiliations_userIdInt: many(contributorAffiliations, {
    relationName: "contributorAffiliations_useIdInt_users_idInt",
  }),
  contributorsLegacy: many(contributorsLegacy, {
    relationName: "contributorsLegacy_userId_users_id",
  }),
  contributorsLegacy_userIdInt: many(contributorsLegacy, {
    relationName: "contributorsLegacy_useIdInt_users_idInt",
  }),
  contributors: many(contributors, {
    relationName: "contributors_userId_users_id",
  }),
  contributors_userIdInt: many(contributors, {
    relationName: "contributors_useIdInt_users_idInt",
  }),
  followers: many(followers, {
    relationName: "followers_followerId_users_id",
  }),
  followers_followerIdInt: many(followers, {
    relationName: "followers_followeIdInt_users_idInt",
  }),
  followedUsers: many(followers, {
    relationName: "followers_leaderId_users_id",
  }),
  followers_leaderIdInt: many(followers, {
    relationName: "followers_leadeIdInt_users_idInt",
  }),
  notifications: many(notifications, {
    relationName: "notifications_userId_users_id",
  }),
  notifications_userIdInt: many(notifications, {
    relationName: "notifications_useIdInt_users_idInt",
  }),
  orgFollowers: many(orgFollowers, {
    relationName: "orgFollowers_followerId_users_id",
  }),
  orgFollowers_followerIdInt: many(orgFollowers, {
    relationName: "orgFollowers_followeIdInt_users_idInt",
  }),
  orgUserMaps: many(orgUserMap, {
    relationName: "orgUserMap_userId_users_id",
  }),
  orgUserMaps_userIdInt: many(orgUserMap, {
    relationName: "orgUserMap_useIdInt_users_idInt",
  }),
  publications: many(publications, {
    relationName: "publications_ownerId_users_id",
  }),
  publications_ownerIdInt: many(publications, {
    relationName: "publications_owneIdInt_users_idInt",
  }),
  tempLinks: many(tempLinks, {
    relationName: "tempLinks_userId_users_id",
  }),
  tempLinks_userIdInt: many(tempLinks, {
    relationName: "tempLinks_useIdInt_users_idInt",
  }),
  userNotificationSettings: many(userNotificationSettings, {
    relationName: "userNotificationSettings_userId_users_id",
  }),
  userNotificationSettings_userIdInt: many(userNotificationSettings, {
    relationName: "userNotificationSettings_useIdInt_users_idInt",
  }),
}));

export const versionsRelations = relations(versions, ({ one, many }) => ({
  comments: many(comments, {
    relationName: "comments_versionId_versions_id",
  }),
  comments_versionIdInt: many(comments, {
    relationName: "comments_versionIdInt_versions_idInt",
  }),
  contributorAffiliations: many(contributorAffiliations, {
    relationName: "contributorAffiliations_versionId_versions_id",
  }),
  contributorAffiliations_versionIdInt: many(contributorAffiliations, {
    relationName: "contributorAffiliations_versionIdInt_versions_idInt",
  }),
  contributors: many(contributors, {
    relationName: "contributors_versionId_versions_id",
  }),
  contributors_versionIdInt: many(contributors, {
    relationName: "contributors_versionIdInt_versions_idInt",
  }),
  linkedAssets: many(linkedAssets, {
    relationName: "linkedAssets_versionId_versions_id",
  }),
  linkedAssets_versionIdInt: many(linkedAssets, {
    relationName: "linkedAssets_versionIdInt_versions_idInt",
  }),
  versionReferences: many(versionReferences, {
    relationName: "versionReferences_versionId_versions_id",
  }),
  versionReferences_versionIdInt: many(versionReferences, {
    relationName: "versionReferences_versionIdInt_versions_idInt",
  }),
  publication_publicationIdInt: one(publications, {
    fields: [versions.publicationIdInt],
    references: [publications.idInt],
    relationName: "versions_publicatioIdInt_publications_idInt",
  }),
  publication: one(publications, {
    fields: [versions.publicationId],
    references: [publications.id],
    relationName: "versions_publicationId_publications_id",
  }),
}));

export const contributorAffiliationsRelations = relations(
  contributorAffiliations,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [contributorAffiliations.affiliatedOrgId],
      references: [organizations.id],
      relationName: "contributorAffiliations_affiliatedOrgId_organizations_id",
    }),
    organization_affiliatedOrgIdInt: one(organizations, {
      fields: [contributorAffiliations.affiliatedOrgIdInt],
      references: [organizations.idInt],
      relationName:
        "contributorAffiliations_affiliatedOrIdInt_organizations_idInt",
    }),
    user: one(users, {
      fields: [contributorAffiliations.userId],
      references: [users.id],
      relationName: "contributorAffiliations_userId_users_id",
    }),
    user_userIdInt: one(users, {
      fields: [contributorAffiliations.userIdInt],
      references: [users.idInt],
      relationName: "contributorAffiliations_useIdInt_users_idInt",
    }),
    version: one(versions, {
      fields: [contributorAffiliations.versionId],
      references: [versions.id],
      relationName: "contributorAffiliations_versionId_versions_id",
    }),
    version_versionIdInt: one(versions, {
      fields: [contributorAffiliations.versionIdInt],
      references: [versions.idInt],
      relationName: "contributorAffiliations_versionIdInt_versions_idInt",
    }),
  })
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  contributorAffiliations: many(contributorAffiliations, {
    relationName: "contributorAffiliations_affiliatedOrgId_organizations_id",
  }),
  contributorAffiliations_affiliatedOrgIdInt: many(contributorAffiliations, {
    relationName:
      "contributorAffiliations_affiliatedOrIdInt_organizations_idInt",
  }),
  orgFollowers_orgIdInt: many(orgFollowers, {
    relationName: "orgFollowers_orIdInt_organizations_idInt",
  }),
  orgFollowers: many(orgFollowers, {
    relationName: "orgFollowers_orgId_organizations_id",
  }),
  orgPublicationMaps_orgIdInt: many(orgPublicationMap, {
    relationName: "orgPublicationMap_orIdInt_organizations_idInt",
  }),
  orgPublicationMaps: many(orgPublicationMap, {
    relationName: "orgPublicationMap_orgId_organizations_id",
  }),
  orgUserMaps_orgIdInt: many(orgUserMap, {
    relationName: "orgUserMap_orIdInt_organizations_idInt",
  }),
  orgUserMaps: many(orgUserMap, {
    relationName: "orgUserMap_orgId_organizations_id",
  }),
}));

export const contributorsLegacyRelations = relations(
  contributorsLegacy,
  ({ one }) => ({
    publication_publicationIdInt: one(publications, {
      fields: [contributorsLegacy.publicationIdInt],
      references: [publications.idInt],
      relationName: "contributorsLegacy_publicatioIdInt_publications_idInt",
    }),
    publication: one(publications, {
      fields: [contributorsLegacy.publicationId],
      references: [publications.id],
      relationName: "contributorsLegacy_publicationId_publications_id",
    }),
    user: one(users, {
      fields: [contributorsLegacy.userId],
      references: [users.id],
      relationName: "contributorsLegacy_userId_users_id",
    }),
    user_userIdInt: one(users, {
      fields: [contributorsLegacy.userIdInt],
      references: [users.idInt],
      relationName: "contributorsLegacy_useIdInt_users_idInt",
    }),
  })
);

export const contributorsRelations = relations(contributors, ({ one }) => ({
  version_versionIdInt: one(versions, {
    fields: [contributors.versionIdInt],
    references: [versions.idInt],
    relationName: "contributors_versionIdInt_versions_idInt",
  }),
  version: one(versions, {
    fields: [contributors.versionId],
    references: [versions.id],
    relationName: "contributors_versionId_versions_id",
  }),
  user: one(users, {
    fields: [contributors.userId],
    references: [users.id],
    relationName: "contributors_userId_users_id",
  }),
  user_userIdInt: one(users, {
    fields: [contributors.userIdInt],
    references: [users.idInt],
    relationName: "contributors_useIdInt_users_idInt",
  }),
}));

export const followersRelations = relations(followers, ({ one }) => ({
  follower: one(users, {
    fields: [followers.followerId],
    references: [users.id],
    relationName: "followers_followerId_users_id",
  }),
  user_followerIdInt: one(users, {
    fields: [followers.followerIdInt],
    references: [users.idInt],
    relationName: "followers_followeIdInt_users_idInt",
  }),
  leader: one(users, {
    fields: [followers.leaderId],
    references: [users.id],
    relationName: "followers_leaderId_users_id",
  }),
  user_leaderIdInt: one(users, {
    fields: [followers.leaderIdInt],
    references: [users.idInt],
    relationName: "followers_leadeIdInt_users_idInt",
  }),
}));

export const linkedAssetsRelations = relations(linkedAssets, ({ one }) => ({
  version_versionId: one(versions, {
    fields: [linkedAssets.versionId],
    references: [versions.id],
    relationName: "linkedAssets_versionId_versions_id",
  }),
  version_versionIdInt: one(versions, {
    fields: [linkedAssets.versionIdInt],
    references: [versions.idInt],
    relationName: "linkedAssets_versionIdInt_versions_idInt",
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  commentInt: one(comments, {
    fields: [notifications.commentIdInt],
    references: [comments.idInt],
    relationName: "notifications_commenIdInt_comments_idInt",
  }),
  comment: one(comments, {
    fields: [notifications.commentId],
    references: [comments.id],
    relationName: "notifications_commentId_comments_id",
  }),
  publicationInt: one(publications, {
    fields: [notifications.publicationIdInt],
    references: [publications.idInt],
    relationName: "notifications_publicatioIdInt_publications_idInt",
  }),
  publication: one(publications, {
    fields: [notifications.publicationId],
    references: [publications.id],
    relationName: "notifications_publicationId_publications_id",
  }),
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: "notifications_userId_users_id",
  }),
  userInt: one(users, {
    fields: [notifications.userIdInt],
    references: [users.idInt],
    relationName: "notifications_useIdInt_users_idInt",
  }),
}));

export const orgFollowersRelations = relations(orgFollowers, ({ one }) => ({
  user: one(users, {
    fields: [orgFollowers.followerId],
    references: [users.id],
    relationName: "orgFollowers_followerId_users_id",
  }),
  user_followerIdInt: one(users, {
    fields: [orgFollowers.followerIdInt],
    references: [users.idInt],
    relationName: "orgFollowers_followeIdInt_users_idInt",
  }),
  organization_orgIdInt: one(organizations, {
    fields: [orgFollowers.orgIdInt],
    references: [organizations.idInt],
    relationName: "orgFollowers_orIdInt_organizations_idInt",
  }),
  organization: one(organizations, {
    fields: [orgFollowers.orgId],
    references: [organizations.id],
    relationName: "orgFollowers_orgId_organizations_id",
  }),
}));

export const orgPublicationMapRelations = relations(
  orgPublicationMap,
  ({ one }) => ({
    organization_orgIdInt: one(organizations, {
      fields: [orgPublicationMap.orgIdInt],
      references: [organizations.idInt],
      relationName: "orgPublicationMap_orIdInt_organizations_idInt",
    }),
    organization: one(organizations, {
      fields: [orgPublicationMap.orgId],
      references: [organizations.id],
      relationName: "orgPublicationMap_orgId_organizations_id",
    }),
    publication_publicationIdInt: one(publications, {
      fields: [orgPublicationMap.publicationIdInt],
      references: [publications.idInt],
      relationName: "orgPublicationMap_publicatioIdInt_publications_idInt",
    }),
    publication: one(publications, {
      fields: [orgPublicationMap.publicationId],
      references: [publications.id],
      relationName: "orgPublicationMap_publicationId_publications_id",
    }),
  })
);

export const orgUserMapRelations = relations(orgUserMap, ({ one }) => ({
  organization_orgIdInt: one(organizations, {
    fields: [orgUserMap.orgIdInt],
    references: [organizations.idInt],
    relationName: "orgUserMap_orIdInt_organizations_idInt",
  }),
  organization: one(organizations, {
    fields: [orgUserMap.orgId],
    references: [organizations.id],
    relationName: "orgUserMap_orgId_organizations_id",
  }),
  user: one(users, {
    fields: [orgUserMap.userId],
    references: [users.id],
    relationName: "orgUserMap_userId_users_id",
  }),
  user_userIdInt: one(users, {
    fields: [orgUserMap.userIdInt],
    references: [users.idInt],
    relationName: "orgUserMap_useIdInt_users_idInt",
  }),
}));

export const publicationTagsRelations = relations(
  publicationTags,
  ({ one }) => ({
    publication_publicationIdInt: one(publications, {
      fields: [publicationTags.publicationIdInt],
      references: [publications.idInt],
      relationName: "publicationTags_publicatioIdInt_publications_idInt",
    }),
    publication: one(publications, {
      fields: [publicationTags.publicationId],
      references: [publications.id],
      relationName: "publicationTags_publicationId_publications_id",
    }),
  })
);

export const tempLinksRelations = relations(tempLinks, ({ one }) => ({
  user: one(users, {
    fields: [tempLinks.userId],
    references: [users.id],
    relationName: "tempLinks_userId_users_id",
  }),
  user_userIdInt: one(users, {
    fields: [tempLinks.userIdInt],
    references: [users.idInt],
    relationName: "tempLinks_useIdInt_users_idInt",
  }),
}));

export const userNotificationSettingsRelations = relations(
  userNotificationSettings,
  ({ one }) => ({
    notificationType_notificationTypeIdInt: one(notificationTypes, {
      fields: [userNotificationSettings.notificationTypeIdInt],
      references: [notificationTypes.idInt],
      relationName:
        "userNotificationSettings_notificationTypIdInt_notificationTypes_idInt",
    }),
    notificationType: one(notificationTypes, {
      fields: [userNotificationSettings.notificationTypeId],
      references: [notificationTypes.id],
      relationName:
        "userNotificationSettings_notificationTypeId_notificationTypes_id",
    }),
    user: one(users, {
      fields: [userNotificationSettings.userId],
      references: [users.id],
      relationName: "userNotificationSettings_userId_users_id",
    }),
    user_userIdInt: one(users, {
      fields: [userNotificationSettings.userIdInt],
      references: [users.idInt],
      relationName: "userNotificationSettings_useIdInt_users_idInt",
    }),
  })
);

export const notificationTypesRelations = relations(
  notificationTypes,
  ({ many }) => ({
    userNotificationSettings_notificationTypeIdInt: many(
      userNotificationSettings,
      {
        relationName:
          "userNotificationSettings_notificationTypIdInt_notificationTypes_idInt",
      }
    ),
    userNotificationSettings: many(userNotificationSettings, {
      relationName:
        "userNotificationSettings_notificationTypeId_notificationTypes_id",
    }),
  })
);

export const versionReferencesRelations = relations(
  versionReferences,
  ({ one }) => ({
    reference_referenceIdInt: one(references, {
      fields: [versionReferences.referenceIdInt],
      references: [references.idInt],
      relationName: "versionReferences_referencIdInt_references_idInt",
    }),
    reference: one(references, {
      fields: [versionReferences.referenceId],
      references: [references.id],
      relationName: "versionReferences_referenceId_references_id",
    }),
    version: one(versions, {
      fields: [versionReferences.versionId],
      references: [versions.id],
      relationName: "versionReferences_versionId_versions_id",
    }),
    version_versionIdInt: one(versions, {
      fields: [versionReferences.versionIdInt],
      references: [versions.idInt],
      relationName: "versionReferences_versionIdInt_versions_idInt",
    }),
  })
);

export const referencesRelations = relations(references, ({ many }) => ({
  versionReferences_referenceIdInt: many(versionReferences, {
    relationName: "versionReferences_referencIdInt_references_idInt",
  }),
  versionReferences: many(versionReferences, {
    relationName: "versionReferences_referenceId_references_id",
  }),
}));

////////////////////////
// Better Auth relations
////////////////////////

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));
