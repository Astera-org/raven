-- MySQL dump 10.13  Distrib 9.7.1, for macos26.4 (arm64)
--
-- Host: localhost    Database: express_test_50799
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `__drizzle_migrations`
--

DROP TABLE IF EXISTS `__drizzle_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `__drizzle_migrations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `hash` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `__drizzle_migrations`
--

LOCK TABLES `__drizzle_migrations` WRITE;
/*!40000 ALTER TABLE `__drizzle_migrations` DISABLE KEYS */;
INSERT INTO `__drizzle_migrations` VALUES (1,'eb67ab37cc6cda92ed9d12e2f7b5c48b2655dda9be2605c1f51b59d93b813b6f',1782156313348),(2,'15e7b0a638fb074e1137e7a262ff7de064f14723816cbcd600dd89addd68cca6',1782159480145),(3,'bc8e5909f6391cdf0dd6fdf65cfa8b0c660679c43d1d8caa0bdd22abd9578b28',1782161973234),(4,'d824eb46e9b5f1939180c53423cdcf7c7053714af54cec339d0590e0064d73db',1782164885104),(5,'862c1310750ec1b6385c276da8720e57fb095aec159ed91c740c607b0cba7bc7',1782238247992),(6,'1c8a4e51bb160a60601de3e75abc674e54ddfaedbad7463e021aee375f536b02',1782238247993),(7,'fb9f289623cdbbf47d8409e56a4d5921d5154d459fd43f800d6ad14f74825a7d',1782171874717),(8,'18023bcd5efe2f108f10ddec24aead21b96c3afd305522e3f9e0dda3cd881cf8',1782487694078),(9,'2f460ce58bd98f24c625f7cfb9f1fe413717b63043b4ae752dda3d66c6da767c',1782516445812),(10,'c22026cc17526c474cfe55c99270368d115e361d6e99ec7b71ec999a41688a4e',1782765584100),(11,'af1a749ca89f5550414b3f601fc0dcade02ac8cfc4948a75690cd0d49b12d851',1782774464806),(12,'904e5b48a1d97860081ca309ccfc7f8e6860c9d88b9a089c9bd61a0e24ce6b70',1787844734004),(13,'6ebe79fbf1c4e393f2631dbec9d3832f843f465f5e6c729ece3bde8fe8cd7935',1789488778276),(14,'160f8d4aaf71232083db3c4f6eb27084db99a2e5869f34fa0c9a08059e4872d8',1789689050631),(15,'6bc74281f1221c6a8e1c48f15edf7794e593ba7bdcea9579fee1f271060da646',1789691366875),(16,'0f65c970f31a40e4e85b2515fe672883eca39625b16e8b1a0550d5b6b0e6041a',1790115990521),(17,'d8c1261a42f6b6da91650ece5ecbe4814292b9bc2197ada551cab8ac9793b90d',1790116329424);
/*!40000 ALTER TABLE `__drizzle_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `accounts`
--

DROP TABLE IF EXISTS `accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts` (
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_id` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider_id` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `access_token` text COLLATE utf8mb4_unicode_ci,
  `refresh_token` text COLLATE utf8mb4_unicode_ci,
  `id_token` text COLLATE utf8mb4_unicode_ci,
  `access_token_expires_at` datetime(3) DEFAULT NULL,
  `refresh_token_expires_at` datetime(3) DEFAULT NULL,
  `scope` text COLLATE utf8mb4_unicode_ci,
  `password` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `account_userId_idx` (`user_id`),
  CONSTRAINT `accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts`
--

LOCK TABLES `accounts` WRITE;
/*!40000 ALTER TABLE `accounts` DISABLE KEYS */;
/*!40000 ALTER TABLE `accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `comments`
--

DROP TABLE IF EXISTS `comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comments` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `publication_id_int` int NOT NULL,
  `publication_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version_id_int` int DEFAULT NULL,
  `version_id` varchar(26) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id_int` int NOT NULL,
  `user_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id_int` int DEFAULT NULL,
  `parent_id` varchar(26) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `anchor_text` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pre_text` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `post_text` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approved` tinyint(1) DEFAULT '0',
  `state` enum('PUBLISHED','MODERATED','DELETED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PUBLISHED',
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `comments_id_unique` (`id`),
  KEY `comments_version_id_int_versions_id_int_fk` (`version_id_int`),
  KEY `comments_user_id_int_users_id_int_fk` (`user_id_int`),
  KEY `idx_publication_state` (`publication_id_int`,`state`),
  KEY `comments_publication_id_publications_id_fk` (`publication_id`),
  KEY `comments_version_id_versions_id_fk` (`version_id`),
  KEY `comments_user_id_users_id_fk` (`user_id`),
  KEY `fk_comments_parent_int` (`parent_id_int`),
  KEY `fk_comments_parent` (`parent_id`),
  CONSTRAINT `comments_publication_id_int_publications_id_int_fk` FOREIGN KEY (`publication_id_int`) REFERENCES `publications` (`id_int`) ON DELETE RESTRICT,
  CONSTRAINT `comments_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `comments_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users` (`id_int`) ON DELETE RESTRICT,
  CONSTRAINT `comments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `comments_version_id_int_versions_id_int_fk` FOREIGN KEY (`version_id_int`) REFERENCES `versions` (`id_int`) ON DELETE RESTRICT,
  CONSTRAINT `comments_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_comments_parent` FOREIGN KEY (`parent_id`) REFERENCES `comments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_comments_parent_int` FOREIGN KEY (`parent_id_int`) REFERENCES `comments` (`id_int`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `comments`
--

LOCK TABLES `comments` WRITE;
/*!40000 ALTER TABLE `comments` DISABLE KEYS */;
/*!40000 ALTER TABLE `comments` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `comments_bi` BEFORE INSERT ON `comments` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.publication_id IS NULL AND NEW.publication_id_int IS NOT NULL THEN
    SET NEW.publication_id = (
      SELECT id FROM publications WHERE id_int = NEW.publication_id_int
    );
  ELSEIF NEW.publication_id_int IS NULL AND NEW.publication_id IS NOT NULL THEN
    SET NEW.publication_id_int = (
      SELECT id_int FROM publications WHERE id = NEW.publication_id
    );
  END IF;

  IF NEW.version_id IS NULL AND NEW.version_id_int IS NOT NULL THEN
    SET NEW.version_id = (
      SELECT id FROM versions WHERE id_int = NEW.version_id_int
    );
  ELSEIF NEW.version_id_int IS NULL AND NEW.version_id IS NOT NULL THEN
    SET NEW.version_id_int = (
      SELECT id_int FROM versions WHERE id = NEW.version_id
    );
  END IF;

  IF NEW.user_id IS NULL AND NEW.user_id_int IS NOT NULL THEN
    SET NEW.user_id = (
      SELECT id FROM users WHERE id_int = NEW.user_id_int
    );
  ELSEIF NEW.user_id_int IS NULL AND NEW.user_id IS NOT NULL THEN
    SET NEW.user_id_int = (
      SELECT id_int FROM users WHERE id = NEW.user_id
    );
  END IF;

  IF NEW.parent_id IS NULL AND NEW.parent_id_int IS NOT NULL THEN
    SET NEW.parent_id = (
      SELECT id FROM comments WHERE id_int = NEW.parent_id_int
    );
  ELSEIF NEW.parent_id_int IS NULL AND NEW.parent_id IS NOT NULL THEN
    SET NEW.parent_id_int = (
      SELECT id_int FROM comments WHERE id = NEW.parent_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `contributor_affiliations`
--

DROP TABLE IF EXISTS `contributor_affiliations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contributor_affiliations` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version_id_int` int NOT NULL,
  `version_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id_int` int NOT NULL,
  `user_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `affiliated_org_id_int` int NOT NULL,
  `affiliated_org_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `idx_version_user_org` (`version_id_int`,`user_id_int`,`affiliated_org_id_int`),
  UNIQUE KEY `contributor_affiliations_id_unique` (`id`),
  KEY `user_id_int` (`user_id_int`),
  KEY `affiliated_org_id_int` (`affiliated_org_id_int`),
  KEY `contributor_affiliations_version_id_versions_id_fk` (`version_id`),
  KEY `contributor_affiliations_user_id_users_id_fk` (`user_id`),
  KEY `ca_affiliated_org_id_organizations_id_fk` (`affiliated_org_id`),
  CONSTRAINT `ca_affiliated_org_id_int_organizations_id_int_fk` FOREIGN KEY (`affiliated_org_id_int`) REFERENCES `organizations` (`id_int`) ON DELETE RESTRICT,
  CONSTRAINT `ca_affiliated_org_id_organizations_id_fk` FOREIGN KEY (`affiliated_org_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `contributor_affiliations_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users` (`id_int`) ON DELETE RESTRICT,
  CONSTRAINT `contributor_affiliations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `contributor_affiliations_version_id_int_versions_id_int_fk` FOREIGN KEY (`version_id_int`) REFERENCES `versions` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `contributor_affiliations_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contributor_affiliations`
--

LOCK TABLES `contributor_affiliations` WRITE;
/*!40000 ALTER TABLE `contributor_affiliations` DISABLE KEYS */;
/*!40000 ALTER TABLE `contributor_affiliations` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `contributor_affiliations_bi` BEFORE INSERT ON `contributor_affiliations` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.version_id IS NULL AND NEW.version_id_int IS NOT NULL THEN
    SET NEW.version_id = (
      SELECT id FROM versions WHERE id_int = NEW.version_id_int
    );
  ELSEIF NEW.version_id_int IS NULL AND NEW.version_id IS NOT NULL THEN
    SET NEW.version_id_int = (
      SELECT id_int FROM versions WHERE id = NEW.version_id
    );
  END IF;

  IF NEW.user_id IS NULL AND NEW.user_id_int IS NOT NULL THEN
    SET NEW.user_id = (
      SELECT id FROM users WHERE id_int = NEW.user_id_int
    );
  ELSEIF NEW.user_id_int IS NULL AND NEW.user_id IS NOT NULL THEN
    SET NEW.user_id_int = (
      SELECT id_int FROM users WHERE id = NEW.user_id
    );
  END IF;

  IF NEW.affiliated_org_id IS NULL AND NEW.affiliated_org_id_int IS NOT NULL THEN
    SET NEW.affiliated_org_id = (
      SELECT id FROM organizations WHERE id_int = NEW.affiliated_org_id_int
    );
  ELSEIF NEW.affiliated_org_id_int IS NULL AND NEW.affiliated_org_id IS NOT NULL THEN
    SET NEW.affiliated_org_id_int = (
      SELECT id_int FROM organizations WHERE id = NEW.affiliated_org_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `contributors`
--

DROP TABLE IF EXISTS `contributors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contributors` (
  `publication_id_int` int NOT NULL,
  `publication_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id_int` int NOT NULL,
  `user_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` int DEFAULT NULL,
  `role` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `in_byline` tinyint(1) DEFAULT '0',
  UNIQUE KEY `pub_user_role_int` (`publication_id_int`,`user_id_int`,`role`),
  KEY `idx_publication_id_int` (`publication_id_int`),
  KEY `idx_user_id_int` (`user_id_int`),
  KEY `contributors_publication_id_publications_id_fk` (`publication_id`),
  KEY `contributors_user_id_users_id_fk` (`user_id`),
  CONSTRAINT `contributors_publication_id_int_publications_id_int_fk` FOREIGN KEY (`publication_id_int`) REFERENCES `publications` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `contributors_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `contributors_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users` (`id_int`) ON DELETE RESTRICT,
  CONSTRAINT `contributors_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contributors`
--

LOCK TABLES `contributors` WRITE;
/*!40000 ALTER TABLE `contributors` DISABLE KEYS */;
/*!40000 ALTER TABLE `contributors` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `contributors_bi` BEFORE INSERT ON `contributors` FOR EACH ROW BEGIN
  IF NEW.publication_id IS NULL AND NEW.publication_id_int IS NOT NULL THEN
    SET NEW.publication_id = (
      SELECT id FROM publications WHERE id_int = NEW.publication_id_int
    );
  ELSEIF NEW.publication_id_int IS NULL AND NEW.publication_id IS NOT NULL THEN
    SET NEW.publication_id_int = (
      SELECT id_int FROM publications WHERE id = NEW.publication_id
    );
  END IF;

  IF NEW.user_id IS NULL AND NEW.user_id_int IS NOT NULL THEN
    SET NEW.user_id = (
      SELECT id FROM users WHERE id_int = NEW.user_id_int
    );
  ELSEIF NEW.user_id_int IS NULL AND NEW.user_id IS NOT NULL THEN
    SET NEW.user_id_int = (
      SELECT id_int FROM users WHERE id = NEW.user_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `followers`
--

DROP TABLE IF EXISTS `followers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `followers` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `leader_id_int` int NOT NULL,
  `leader_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `follower_id_int` int NOT NULL,
  `follower_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `followers_id_unique` (`id`),
  KEY `followers_leader_id_int_users_id_int_fk` (`leader_id_int`),
  KEY `followers_follower_id_int_users_id_int_fk` (`follower_id_int`),
  KEY `followers_leader_id_users_id_fk` (`leader_id`),
  KEY `followers_follower_id_users_id_fk` (`follower_id`),
  CONSTRAINT `followers_follower_id_int_users_id_int_fk` FOREIGN KEY (`follower_id_int`) REFERENCES `users` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `followers_follower_id_users_id_fk` FOREIGN KEY (`follower_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `followers_leader_id_int_users_id_int_fk` FOREIGN KEY (`leader_id_int`) REFERENCES `users` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `followers_leader_id_users_id_fk` FOREIGN KEY (`leader_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `followers`
--

LOCK TABLES `followers` WRITE;
/*!40000 ALTER TABLE `followers` DISABLE KEYS */;
/*!40000 ALTER TABLE `followers` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `followers_bi` BEFORE INSERT ON `followers` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.leader_id IS NULL AND NEW.leader_id_int IS NOT NULL THEN
    SET NEW.leader_id = (
      SELECT id FROM users WHERE id_int = NEW.leader_id_int
    );
  ELSEIF NEW.leader_id_int IS NULL AND NEW.leader_id IS NOT NULL THEN
    SET NEW.leader_id_int = (
      SELECT id_int FROM users WHERE id = NEW.leader_id
    );
  END IF;

  IF NEW.follower_id IS NULL AND NEW.follower_id_int IS NOT NULL THEN
    SET NEW.follower_id = (
      SELECT id FROM users WHERE id_int = NEW.follower_id_int
    );
  ELSEIF NEW.follower_id_int IS NULL AND NEW.follower_id IS NOT NULL THEN
    SET NEW.follower_id_int = (
      SELECT id_int FROM users WHERE id = NEW.follower_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `linked_assets`
--

DROP TABLE IF EXISTS `linked_assets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `linked_assets` (
  `version_id_int` int NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `version_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  UNIQUE KEY `version_id_int` (`version_id_int`,`type`,`url`),
  KEY `linked_assets_version_id_versions_id_fk` (`version_id`),
  CONSTRAINT `linked_assets_version_id_int_versions_id_int_fk` FOREIGN KEY (`version_id_int`) REFERENCES `versions` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `linked_assets_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `linked_assets`
--

LOCK TABLES `linked_assets` WRITE;
/*!40000 ALTER TABLE `linked_assets` DISABLE KEYS */;
/*!40000 ALTER TABLE `linked_assets` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `linked_assets_bi` BEFORE INSERT ON `linked_assets` FOR EACH ROW BEGIN
  IF NEW.version_id IS NULL AND NEW.version_id_int IS NOT NULL THEN
    SET NEW.version_id = (
      SELECT id FROM versions WHERE id_int = NEW.version_id_int
    );
  ELSEIF NEW.version_id_int IS NULL AND NEW.version_id IS NOT NULL THEN
    SET NEW.version_id_int = (
      SELECT id_int FROM versions WHERE id = NEW.version_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `notification_types`
--

DROP TABLE IF EXISTS `notification_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_types` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `state` enum('ACTIVE','DEPRECATED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `trigger` enum('NEW_COMMENT') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `priority` int DEFAULT NULL,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime DEFAULT (now()),
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `notification_types_type_unique` (`type`),
  UNIQUE KEY `notification_types_id_unique` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_types`
--

LOCK TABLES `notification_types` WRITE;
/*!40000 ALTER TABLE `notification_types` DISABLE KEYS */;
/*!40000 ALTER TABLE `notification_types` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `notification_types_bi` BEFORE INSERT ON `notification_types` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id_int` int NOT NULL,
  `user_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `publication_id_int` int DEFAULT NULL,
  `publication_id` varchar(26) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `comment_id_int` int DEFAULT NULL,
  `comment_id` varchar(26) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `state` enum('NEW_PUBLICATION','UPDATED_PUBLICATION','COMMENT','REPLY','MESSAGE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NEW_PUBLICATION',
  `seen` tinyint DEFAULT NULL,
  `created_at` datetime DEFAULT (now()),
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `notifications_id_unique` (`id`),
  KEY `notifications_user_id_int_users_id_int_fk` (`user_id_int`),
  KEY `notifications_publication_id_int_publications_id_int_fk` (`publication_id_int`),
  KEY `notifications_comment_id_int_comments_id_int_fk` (`comment_id_int`),
  KEY `notifications_user_id_users_id_fk` (`user_id`),
  KEY `notifications_publication_id_publications_id_fk` (`publication_id`),
  KEY `notifications_comment_id_comments_id_fk` (`comment_id`),
  CONSTRAINT `notifications_comment_id_comments_id_fk` FOREIGN KEY (`comment_id`) REFERENCES `comments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notifications_comment_id_int_comments_id_int_fk` FOREIGN KEY (`comment_id_int`) REFERENCES `comments` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `notifications_publication_id_int_publications_id_int_fk` FOREIGN KEY (`publication_id_int`) REFERENCES `publications` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `notifications_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notifications_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `notifications_bi` BEFORE INSERT ON `notifications` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.user_id IS NULL AND NEW.user_id_int IS NOT NULL THEN
    SET NEW.user_id = (
      SELECT id FROM users WHERE id_int = NEW.user_id_int
    );
  ELSEIF NEW.user_id_int IS NULL AND NEW.user_id IS NOT NULL THEN
    SET NEW.user_id_int = (
      SELECT id_int FROM users WHERE id = NEW.user_id
    );
  END IF;

  IF NEW.publication_id IS NULL AND NEW.publication_id_int IS NOT NULL THEN
    SET NEW.publication_id = (
      SELECT id FROM publications WHERE id_int = NEW.publication_id_int
    );
  ELSEIF NEW.publication_id_int IS NULL AND NEW.publication_id IS NOT NULL THEN
    SET NEW.publication_id_int = (
      SELECT id_int FROM publications WHERE id = NEW.publication_id
    );
  END IF;

  IF NEW.comment_id IS NULL AND NEW.comment_id_int IS NOT NULL THEN
    SET NEW.comment_id = (
      SELECT id FROM comments WHERE id_int = NEW.comment_id_int
    );
  ELSEIF NEW.comment_id_int IS NULL AND NEW.comment_id IS NOT NULL THEN
    SET NEW.comment_id_int = (
      SELECT id_int FROM comments WHERE id = NEW.comment_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `org_followers`
--

DROP TABLE IF EXISTS `org_followers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `org_followers` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `org_id_int` int NOT NULL,
  `org_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `follower_id_int` int NOT NULL,
  `follower_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `org_followers_id_unique` (`id`),
  KEY `org_followers_org_id_int_organizations_id_int_fk` (`org_id_int`),
  KEY `org_followers_follower_id_int_users_id_int_fk` (`follower_id_int`),
  KEY `org_followers_org_id_organizations_id_fk` (`org_id`),
  KEY `org_followers_follower_id_users_id_fk` (`follower_id`),
  CONSTRAINT `org_followers_follower_id_int_users_id_int_fk` FOREIGN KEY (`follower_id_int`) REFERENCES `users` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `org_followers_follower_id_users_id_fk` FOREIGN KEY (`follower_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `org_followers_org_id_int_organizations_id_int_fk` FOREIGN KEY (`org_id_int`) REFERENCES `organizations` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `org_followers_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `org_followers`
--

LOCK TABLES `org_followers` WRITE;
/*!40000 ALTER TABLE `org_followers` DISABLE KEYS */;
/*!40000 ALTER TABLE `org_followers` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `org_followers_bi` BEFORE INSERT ON `org_followers` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.org_id IS NULL AND NEW.org_id_int IS NOT NULL THEN
    SET NEW.org_id = (
      SELECT id FROM organizations WHERE id_int = NEW.org_id_int
    );
  ELSEIF NEW.org_id_int IS NULL AND NEW.org_id IS NOT NULL THEN
    SET NEW.org_id_int = (
      SELECT id_int FROM organizations WHERE id = NEW.org_id
    );
  END IF;

  IF NEW.follower_id IS NULL AND NEW.follower_id_int IS NOT NULL THEN
    SET NEW.follower_id = (
      SELECT id FROM users WHERE id_int = NEW.follower_id_int
    );
  ELSEIF NEW.follower_id_int IS NULL AND NEW.follower_id IS NOT NULL THEN
    SET NEW.follower_id_int = (
      SELECT id_int FROM users WHERE id = NEW.follower_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `org_publication_map`
--

DROP TABLE IF EXISTS `org_publication_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `org_publication_map` (
  `org_id_int` int NOT NULL,
  `org_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `publication_id_int` int NOT NULL,
  `publication_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` int DEFAULT NULL,
  UNIQUE KEY `idx_org_publication` (`org_id_int`,`publication_id_int`),
  KEY `idx_publication_id_int` (`publication_id_int`),
  KEY `org_publication_map_org_id_organizations_id_fk` (`org_id`),
  KEY `org_publication_map_publication_id_publications_id_fk` (`publication_id`),
  CONSTRAINT `org_publication_map_org_id_int_organizations_id_int_fk` FOREIGN KEY (`org_id_int`) REFERENCES `organizations` (`id_int`) ON DELETE RESTRICT,
  CONSTRAINT `org_publication_map_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `org_publication_map_publication_id_int_publications_id_int_fk` FOREIGN KEY (`publication_id_int`) REFERENCES `publications` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `org_publication_map_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `org_publication_map`
--

LOCK TABLES `org_publication_map` WRITE;
/*!40000 ALTER TABLE `org_publication_map` DISABLE KEYS */;
/*!40000 ALTER TABLE `org_publication_map` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `org_publication_map_bi` BEFORE INSERT ON `org_publication_map` FOR EACH ROW BEGIN
  IF NEW.org_id IS NULL AND NEW.org_id_int IS NOT NULL THEN
    SET NEW.org_id = (
      SELECT id FROM organizations WHERE id_int = NEW.org_id_int
    );
  ELSEIF NEW.org_id_int IS NULL AND NEW.org_id IS NOT NULL THEN
    SET NEW.org_id_int = (
      SELECT id_int FROM organizations WHERE id = NEW.org_id
    );
  END IF;

  IF NEW.publication_id IS NULL AND NEW.publication_id_int IS NOT NULL THEN
    SET NEW.publication_id = (
      SELECT id FROM publications WHERE id_int = NEW.publication_id_int
    );
  ELSEIF NEW.publication_id_int IS NULL AND NEW.publication_id IS NOT NULL THEN
    SET NEW.publication_id_int = (
      SELECT id_int FROM publications WHERE id = NEW.publication_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `org_user_map`
--

DROP TABLE IF EXISTS `org_user_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `org_user_map` (
  `org_id_int` int NOT NULL,
  `org_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id_int` int NOT NULL,
  `user_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `roles` set('ADMIN') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_at` datetime DEFAULT NULL,
  `end_at` datetime DEFAULT NULL,
  UNIQUE KEY `idx_org_user` (`org_id_int`,`user_id_int`),
  KEY `idx_user_id_int` (`user_id_int`),
  KEY `org_user_map_org_id_organizations_id_fk` (`org_id`),
  KEY `org_user_map_user_id_users_id_fk` (`user_id`),
  CONSTRAINT `org_user_map_org_id_int_organizations_id_int_fk` FOREIGN KEY (`org_id_int`) REFERENCES `organizations` (`id_int`) ON DELETE RESTRICT,
  CONSTRAINT `org_user_map_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `org_user_map_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users` (`id_int`) ON DELETE RESTRICT,
  CONSTRAINT `org_user_map_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `org_user_map`
--

LOCK TABLES `org_user_map` WRITE;
/*!40000 ALTER TABLE `org_user_map` DISABLE KEYS */;
/*!40000 ALTER TABLE `org_user_map` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `org_user_map_bi` BEFORE INSERT ON `org_user_map` FOR EACH ROW BEGIN
  IF NEW.org_id IS NULL AND NEW.org_id_int IS NOT NULL THEN
    SET NEW.org_id = (
      SELECT id FROM organizations WHERE id_int = NEW.org_id_int
    );
  ELSEIF NEW.org_id_int IS NULL AND NEW.org_id IS NOT NULL THEN
    SET NEW.org_id_int = (
      SELECT id_int FROM organizations WHERE id = NEW.org_id
    );
  END IF;

  IF NEW.user_id IS NULL AND NEW.user_id_int IS NOT NULL THEN
    SET NEW.user_id = (
      SELECT id FROM users WHERE id_int = NEW.user_id_int
    );
  ELSEIF NEW.user_id_int IS NULL AND NEW.user_id IS NOT NULL THEN
    SET NEW.user_id_int = (
      SELECT id_int FROM users WHERE id = NEW.user_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `organizations`
--

DROP TABLE IF EXISTS `organizations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `organizations` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `avatar` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profile` text COLLATE utf8mb4_unicode_ci,
  `ror_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `doi_minting_enabled` tinyint(1) DEFAULT '0',
  `doi_prefix` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unlisted` tinyint(1) DEFAULT '0',
  `approved` tinyint(1) DEFAULT '0',
  `state` enum('ACTIVE','MODERATED','DELETED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `idx_slug` (`slug`),
  UNIQUE KEY `organizations_slug_unique` (`slug`),
  UNIQUE KEY `organizations_id_unique` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `organizations`
--

LOCK TABLES `organizations` WRITE;
/*!40000 ALTER TABLE `organizations` DISABLE KEYS */;
/*!40000 ALTER TABLE `organizations` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `organizations_bi` BEFORE INSERT ON `organizations` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `publication_tags`
--

DROP TABLE IF EXISTS `publication_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `publication_tags` (
  `publication_id_int` int NOT NULL,
  `publication_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tag` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  KEY `publication_tags_publication_id_int_publications_id_int_fk` (`publication_id_int`),
  KEY `publication_tags_publication_id_publications_id_fk` (`publication_id`),
  CONSTRAINT `publication_tags_publication_id_int_publications_id_int_fk` FOREIGN KEY (`publication_id_int`) REFERENCES `publications` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `publication_tags_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `publication_tags`
--

LOCK TABLES `publication_tags` WRITE;
/*!40000 ALTER TABLE `publication_tags` DISABLE KEYS */;
/*!40000 ALTER TABLE `publication_tags` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `publication_tags_bi` BEFORE INSERT ON `publication_tags` FOR EACH ROW BEGIN
  IF NEW.publication_id IS NULL AND NEW.publication_id_int IS NOT NULL THEN
    SET NEW.publication_id = (
      SELECT id FROM publications WHERE id_int = NEW.publication_id_int
    );
  ELSEIF NEW.publication_id_int IS NULL AND NEW.publication_id IS NOT NULL THEN
    SET NEW.publication_id_int = (
      SELECT id_int FROM publications WHERE id = NEW.publication_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `publications`
--

DROP TABLE IF EXISTS `publications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `publications` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `latest_version_number` tinyint unsigned NOT NULL DEFAULT '1',
  `state` enum('DRAFT','PUBLISHED','DELETED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `owner_id_int` int DEFAULT NULL,
  `owner_id` varchar(26) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `doi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `license` enum('CC BY','CC BY-SA','CC BY-ND','CC BY-NC','CC BY-NC-SA','CC BY-NC-ND','CC0') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CC BY',
  `created_at` datetime NOT NULL DEFAULT (now()),
  `feedback_form_embed_src` text COLLATE utf8mb4_unicode_ci,
  `social_posts_embed_src` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `publications_slug_unique` (`slug`),
  UNIQUE KEY `publications_id_unique` (`id`),
  UNIQUE KEY `publications_doi_unique` (`doi`),
  KEY `owner_id_int` (`owner_id_int`),
  KEY `publications_owner_id_users_id_fk` (`owner_id`),
  CONSTRAINT `publications_owner_id_int_users_id_int_fk` FOREIGN KEY (`owner_id_int`) REFERENCES `users` (`id_int`) ON DELETE RESTRICT,
  CONSTRAINT `publications_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `publications`
--

LOCK TABLES `publications` WRITE;
/*!40000 ALTER TABLE `publications` DISABLE KEYS */;
/*!40000 ALTER TABLE `publications` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `publications_bi` BEFORE INSERT ON `publications` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.owner_id IS NULL AND NEW.owner_id_int IS NOT NULL THEN
    SET NEW.owner_id = (
      SELECT id FROM users WHERE id_int = NEW.owner_id_int
    );
  ELSEIF NEW.owner_id_int IS NULL AND NEW.owner_id IS NOT NULL THEN
    SET NEW.owner_id_int = (
      SELECT id_int FROM users WHERE id = NEW.owner_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `references`
--

DROP TABLE IF EXISTS `references`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `references` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `text` text COLLATE utf8mb4_unicode_ci,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `references_url_unique` (`url`),
  UNIQUE KEY `references_id_unique` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `references`
--

LOCK TABLES `references` WRITE;
/*!40000 ALTER TABLE `references` DISABLE KEYS */;
/*!40000 ALTER TABLE `references` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `references_bi` BEFORE INSERT ON `references` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  `ip_address` text COLLATE utf8mb4_unicode_ci,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `user_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sessions_token_unique` (`token`),
  KEY `session_userId_idx` (`user_id`),
  CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `temp_links`
--

DROP TABLE IF EXISTS `temp_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `temp_links` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id_int` int NOT NULL,
  `user_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime DEFAULT (now()),
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `temp_links_id_unique` (`id`),
  KEY `temp_links_user_id_int_users_id_int_fk` (`user_id_int`),
  KEY `temp_links_user_id_users_id_fk` (`user_id`),
  CONSTRAINT `temp_links_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `temp_links_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `temp_links`
--

LOCK TABLES `temp_links` WRITE;
/*!40000 ALTER TABLE `temp_links` DISABLE KEYS */;
/*!40000 ALTER TABLE `temp_links` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `temp_links_bi` BEFORE INSERT ON `temp_links` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.user_id IS NULL AND NEW.user_id_int IS NOT NULL THEN
    SET NEW.user_id = (
      SELECT id FROM users WHERE id_int = NEW.user_id_int
    );
  ELSEIF NEW.user_id_int IS NULL AND NEW.user_id IS NOT NULL THEN
    SET NEW.user_id_int = (
      SELECT id_int FROM users WHERE id = NEW.user_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `user_notification_settings`
--

DROP TABLE IF EXISTS `user_notification_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_notification_settings` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id_int` int NOT NULL,
  `user_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notification_type_id_int` int NOT NULL,
  `notification_type_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `delivery_method` enum('EMAIL','IN_APP') COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_subscribed` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime DEFAULT (now()),
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `idx_user_type_method` (`user_id_int`,`notification_type_id_int`,`delivery_method`),
  UNIQUE KEY `user_notification_settings_id_unique` (`id`),
  KEY `notification_type_id_int` (`notification_type_id_int`),
  KEY `user_notification_settings_user_id_users_id_fk` (`user_id`),
  KEY `uns_nti_notification_types_id_fk` (`notification_type_id`),
  CONSTRAINT `uns_nti_notification_types_id_fk` FOREIGN KEY (`notification_type_id`) REFERENCES `notification_types` (`id`) ON DELETE CASCADE,
  CONSTRAINT `uns_nti_notification_types_id_int_fk` FOREIGN KEY (`notification_type_id_int`) REFERENCES `notification_types` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `user_notification_settings_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `user_notification_settings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_notification_settings`
--

LOCK TABLES `user_notification_settings` WRITE;
/*!40000 ALTER TABLE `user_notification_settings` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_notification_settings` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `user_notification_settings_bi` BEFORE INSERT ON `user_notification_settings` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.user_id IS NULL AND NEW.user_id_int IS NOT NULL THEN
    SET NEW.user_id = (
      SELECT id FROM users WHERE id_int = NEW.user_id_int
    );
  ELSEIF NEW.user_id_int IS NULL AND NEW.user_id IS NOT NULL THEN
    SET NEW.user_id_int = (
      SELECT id_int FROM users WHERE id = NEW.user_id
    );
  END IF;

  IF NEW.notification_type_id IS NULL AND NEW.notification_type_id_int IS NOT NULL THEN
    SET NEW.notification_type_id = (
      SELECT id FROM notification_types WHERE id_int = NEW.notification_type_id_int
    );
  ELSEIF NEW.notification_type_id_int IS NULL AND NEW.notification_type_id IS NOT NULL THEN
    SET NEW.notification_type_id_int = (
      SELECT id_int FROM notification_types WHERE id = NEW.notification_type_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `username` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image` text COLLATE utf8mb4_unicode_ci,
  `profile` text COLLATE utf8mb4_unicode_ci,
  `orcid` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approved` tinyint(1) DEFAULT '0',
  `state` enum('ACTIVE','SITE_ADMIN','MODERATED','DELETED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `login_at` datetime DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_verified` tinyint(1) NOT NULL DEFAULT '0',
  `display_username` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `users_id_unique` (`id`),
  UNIQUE KEY `users_username_unique` (`username`),
  UNIQUE KEY `users_email_unique` (`email`),
  KEY `orcid_idx` (`orcid`),
  KEY `first_last_name_idx` (`first_name`,`last_name`),
  KEY `last_name_idx` (`last_name`),
  KEY `state_username_idx` (`state`,`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `users_bi` BEFORE INSERT ON `users` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `verifications`
--

DROP TABLE IF EXISTS `verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `verifications` (
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `identifier` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `verification_identifier_idx` (`identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `verifications`
--

LOCK TABLES `verifications` WRITE;
/*!40000 ALTER TABLE `verifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `verifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `version_references`
--

DROP TABLE IF EXISTS `version_references`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `version_references` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version_id_int` int NOT NULL,
  `version_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference_id_int` int NOT NULL,
  `reference_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `version_id_int` (`version_id_int`,`reference_id_int`),
  UNIQUE KEY `version_references_id_unique` (`id`),
  KEY `reference_id_int` (`reference_id_int`),
  KEY `version_references_version_id_versions_id_fk` (`version_id`),
  KEY `version_references_reference_id_references_id_fk` (`reference_id`),
  CONSTRAINT `version_references_reference_id_int_references_id_int_fk` FOREIGN KEY (`reference_id_int`) REFERENCES `references` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `version_references_reference_id_references_id_fk` FOREIGN KEY (`reference_id`) REFERENCES `references` (`id`) ON DELETE CASCADE,
  CONSTRAINT `version_references_version_id_int_versions_id_int_fk` FOREIGN KEY (`version_id_int`) REFERENCES `versions` (`id_int`) ON DELETE CASCADE,
  CONSTRAINT `version_references_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `version_references`
--

LOCK TABLES `version_references` WRITE;
/*!40000 ALTER TABLE `version_references` DISABLE KEYS */;
/*!40000 ALTER TABLE `version_references` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `version_references_bi` BEFORE INSERT ON `version_references` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.version_id IS NULL AND NEW.version_id_int IS NOT NULL THEN
    SET NEW.version_id = (
      SELECT id FROM versions WHERE id_int = NEW.version_id_int
    );
  ELSEIF NEW.version_id_int IS NULL AND NEW.version_id IS NOT NULL THEN
    SET NEW.version_id_int = (
      SELECT id_int FROM versions WHERE id = NEW.version_id
    );
  END IF;

  IF NEW.reference_id IS NULL AND NEW.reference_id_int IS NOT NULL THEN
    SET NEW.reference_id = (
      SELECT id FROM `references` WHERE id_int = NEW.reference_id_int
    );
  ELSEIF NEW.reference_id_int IS NULL AND NEW.reference_id IS NOT NULL THEN
    SET NEW.reference_id_int = (
      SELECT id_int FROM `references` WHERE id = NEW.reference_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `versions`
--

DROP TABLE IF EXISTS `versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `versions` (
  `id_int` int NOT NULL AUTO_INCREMENT,
  `id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `publication_id_int` int NOT NULL,
  `publication_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version_number` tinyint unsigned NOT NULL DEFAULT '1',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subtitle` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `abstract` text COLLATE utf8mb4_unicode_ci,
  `body` mediumtext COLLATE utf8mb4_unicode_ci,
  `version_desc` text COLLATE utf8mb4_unicode_ci,
  `state` enum('DRAFT','PUBLISHED','DELETED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `pdf_state` enum('PROCESSING','GENERATED','FAILED') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pdf_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  `doi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `import_document_filename` text COLLATE utf8mb4_unicode_ci,
  `import_document_url` text COLLATE utf8mb4_unicode_ci,
  `import_document_format` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `import_document_body` mediumtext COLLATE utf8mb4_unicode_ci,
  `import_document_sync_date` datetime DEFAULT NULL,
  PRIMARY KEY (`id_int`),
  UNIQUE KEY `idx_publication_version` (`publication_id_int`,`version_number`),
  UNIQUE KEY `versions_id_unique` (`id`),
  UNIQUE KEY `versions_doi_unique` (`doi`),
  KEY `versions_publication_id_publications_id_fk` (`publication_id`),
  FULLTEXT KEY `ft_search` (`title`,`abstract`,`body`),
  CONSTRAINT `versions_publication_id_int_publications_id_int_fk` FOREIGN KEY (`publication_id_int`) REFERENCES `publications` (`id_int`) ON DELETE RESTRICT,
  CONSTRAINT `versions_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `versions`
--

LOCK TABLES `versions` WRITE;
/*!40000 ALTER TABLE `versions` DISABLE KEYS */;
/*!40000 ALTER TABLE `versions` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 CREATE*/ /*!50017 DEFINER=`harness`@`%`*/ /*!50003 TRIGGER `versions_bi` BEFORE INSERT ON `versions` FOR EACH ROW BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.publication_id IS NULL AND NEW.publication_id_int IS NOT NULL THEN
    SET NEW.publication_id = (
      SELECT id FROM publications WHERE id_int = NEW.publication_id_int
    );
  ELSEIF NEW.publication_id_int IS NULL AND NEW.publication_id IS NOT NULL THEN
    SET NEW.publication_id_int = (
      SELECT id_int FROM publications WHERE id = NEW.publication_id
    );
  END IF;
END */;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-22 16:34:32
