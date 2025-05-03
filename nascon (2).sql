-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: May 03, 2025 at 01:56 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `nascon`
--

-- --------------------------------------------------------

--
-- Table structure for table `accommodation`
--

CREATE TABLE `accommodation` (
  `accommodation_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `room_type` varchar(50) DEFAULT NULL,
  `cost` decimal(10,2) DEFAULT NULL,
  `assigned` tinyint(1) DEFAULT 0,
  `payment_status` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `accommodation`
--

INSERT INTO `accommodation` (`accommodation_id`, `user_id`, `room_type`, `cost`, `assigned`, `payment_status`) VALUES
(1, 4, 'single', 1500.00, 1, 0);

-- --------------------------------------------------------

--
-- Table structure for table `event`
--

CREATE TABLE `event` (
  `event_id` int(11) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `max_participants` int(11) DEFAULT NULL,
  `registration_fee` decimal(10,2) DEFAULT NULL,
  `category` varchar(50) DEFAULT NULL,
  `rules` text DEFAULT NULL,
  `team_allowed` tinyint(1) DEFAULT NULL,
  `max_team_participants_limit` int(11) DEFAULT NULL,
  `organizer_id` int(11) DEFAULT NULL,
  `accepted` tinyint(1) DEFAULT 0,
  `status` enum('pending','accepted','rejected') DEFAULT 'pending',
  `registration_open` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `event`
--

INSERT INTO `event` (`event_id`, `name`, `description`, `max_participants`, `registration_fee`, `category`, `rules`, `team_allowed`, `max_team_participants_limit`, `organizer_id`, `accepted`, `status`, `registration_open`) VALUES
(1, 'Code Clash 2025', 'A thrilling coding competition for developers of all levels.', 150, 25.00, 'Programming', 'No plagiarism, team must submit code before deadline.', 1, 5, 1, 1, 'accepted', 1);

-- --------------------------------------------------------

--
-- Table structure for table `event_round`
--

CREATE TABLE `event_round` (
  `event_round_id` int(11) NOT NULL,
  `event_id` int(11) DEFAULT NULL,
  `roundType` varchar(100) DEFAULT NULL,
  `date_time` datetime DEFAULT NULL,
  `venue_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `event_round`
--

INSERT INTO `event_round` (`event_round_id`, `event_id`, `roundType`, `date_time`, `venue_id`) VALUES
(1, 1, 'Initial', '2025-05-10 15:00:00', 1),
(2, 1, 'mid', '2025-06-10 15:00:00', 1),
(3, 1, 'final', '2025-07-10 15:00:00', 1),
(4, 1, 'final', '2025-05-10 15:00:00', 1);

--
-- Triggers `event_round`
--
DELIMITER $$
CREATE TRIGGER `check_venue_availability_before_insert` BEFORE INSERT ON `event_round` FOR EACH ROW BEGIN
    -- Declare the variable to store the count of bookings
    DECLARE venue_count INT;

    -- Check if the venue is already booked at the selected date and time
    SELECT COUNT(*) INTO venue_count
    FROM event_round
    WHERE venue_id = NEW.venue_id
      AND DATE(NEW.date_time) = DATE(date_time)  -- Compare only the date part
      AND TIME(NEW.date_time) BETWEEN TIME(date_time) AND ADDTIME(TIME(date_time), '02:00:00'); -- Assuming a 2-hour round duration

    -- If the venue is already booked, throw an error
    IF venue_count > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The venue is already booked for this date and time.';
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `judge`
--

CREATE TABLE `judge` (
  `judge_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `event_round_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `participant`
--

CREATE TABLE `participant` (
  `participant_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `event_id` int(11) DEFAULT NULL,
  `payment_status` tinyint(1) DEFAULT 0,
  `team_id` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `participant`
--

INSERT INTO `participant` (`participant_id`, `user_id`, `event_id`, `payment_status`, `team_id`) VALUES
(7, 4, 1, 1, 'team-e0315acdf96f'),
(8, 5, 1, 1, 'team-e0315acdf96f'),
(9, 6, 1, 1, 'team-e0315acdf96f');

--
-- Triggers `participant`
--
DELIMITER $$
CREATE TRIGGER `check_event_approval` BEFORE INSERT ON `participant` FOR EACH ROW BEGIN
  DECLARE approved BOOLEAN;
  DECLARE userExists INT;

  -- Check if the event is approved
  SELECT accepted INTO approved
  FROM event
  WHERE event_id = NEW.event_id;

  -- If event is not approved or is NULL, raise an error
  IF approved IS NULL OR approved = FALSE THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot participate in an unapproved event.';
  END IF;

  -- Check if the user is already participating in the event
  SELECT COUNT(*) INTO userExists
  FROM participant
  WHERE user_id = NEW.user_id AND event_id = NEW.event_id;

  -- If the user is already participating, raise an error
  IF userExists > 0 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'User is already participating in this event.';
  END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `close_registration_if_full` AFTER INSERT ON `participant` FOR EACH ROW BEGIN
  DECLARE participant_count INT;
  DECLARE max_allowed INT;

  -- Get current participant count
  SELECT COUNT(*) INTO participant_count
  FROM participant
  WHERE event_id = NEW.event_id;

  -- Get max participants from event table
  SELECT max_participants INTO max_allowed
  FROM event
  WHERE event_id = NEW.event_id;

  -- Close registration if full
  IF participant_count >= max_allowed THEN
    UPDATE event
    SET accepted = FALSE
    WHERE event_id = NEW.event_id;
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `payment`
--

CREATE TABLE `payment` (
  `payment_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `payment_type` varchar(50) DEFAULT NULL,
  `verified_status` tinyint(1) DEFAULT 0,
  `date` datetime DEFAULT NULL,
  `sponsorship_id` int(11) DEFAULT NULL,
  `accommodation_id` int(11) DEFAULT NULL,
  `team_id` varchar(100) DEFAULT NULL,
  `account_number` varchar(100) NOT NULL,
  `amount` decimal(10,2) DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `payment`
--

INSERT INTO `payment` (`payment_id`, `user_id`, `payment_type`, `verified_status`, `date`, `sponsorship_id`, `accommodation_id`, `team_id`, `account_number`, `amount`) VALUES
(1, 11, 'online', 1, '2025-05-01 11:40:43', 1, NULL, NULL, 'ACC123456789', 100.00),
(2, 4, 'online', 1, '2025-05-01 14:12:10', NULL, NULL, 'team-e0315acdf96f', 'ACC123456789', 1000.00);

--
-- Triggers `payment`
--
DELIMITER $$
CREATE TRIGGER `update_related_payment_status` AFTER UPDATE ON `payment` FOR EACH ROW BEGIN
  -- Only run this if payment was just verified
  IF NEW.verified_status = TRUE AND OLD.verified_status = FALSE THEN

    -- If it's a sponsorship payment
    IF NEW.sponsorship_id IS NOT NULL THEN
      UPDATE sponsorship
      SET payment_status = TRUE
      WHERE id = NEW.sponsorship_id;

    -- If it's an accommodation payment
    ELSEIF NEW.accommodation_id IS NOT NULL THEN
      UPDATE accommodation
      SET payment_status = TRUE
      WHERE accommodation_id = NEW.accommodation_id;

    -- If it's a team/participant payment
    ELSEIF NEW.team_id IS NOT NULL THEN
      UPDATE participant
      SET payment_status = TRUE
      WHERE team_id = NEW.team_id ;

    END IF;

  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `score`
--

CREATE TABLE `score` (
  `score_id` int(11) NOT NULL,
  `team_id` varchar(100) DEFAULT NULL,
  `event_round_id` int(11) DEFAULT NULL,
  `score` decimal(5,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sponsor`
--

CREATE TABLE `sponsor` (
  `sponsor_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `contact_id` varchar(100) DEFAULT NULL,
  `contact_person` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sponsor`
--

INSERT INTO `sponsor` (`sponsor_id`, `user_id`, `contact_id`, `contact_person`) VALUES
(1, 11, 'SPN-456', 'Alex Johnson');

-- --------------------------------------------------------

--
-- Table structure for table `sponsorship`
--

CREATE TABLE `sponsorship` (
  `id` int(11) NOT NULL,
  `sponsor_id` int(11) DEFAULT NULL,
  `package_id` int(11) DEFAULT NULL,
  `payment_status` tinyint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sponsorship`
--

INSERT INTO `sponsorship` (`id`, `sponsor_id`, `package_id`, `payment_status`) VALUES
(1, 1, 1, 1);

-- --------------------------------------------------------

--
-- Table structure for table `sponsorship_package`
--

CREATE TABLE `sponsorship_package` (
  `package_id` int(11) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `perks` text DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sponsorship_package`
--

INSERT INTO `sponsorship_package` (`package_id`, `name`, `perks`, `price`) VALUES
(1, 'Gold Package', 'Logo on all banners, speaking opportunity at opening ceremony', 10000.00),
(2, 'prime Package', 'Logo on all banners, speaking opportunity at opening ceremony', 100000.00),
(3, 'asdasd', 'asdasdas', 100000.00);

-- --------------------------------------------------------

--
-- Table structure for table `tokens`
--

CREATE TABLE `tokens` (
  `token` varchar(255) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tokens`
--

INSERT INTO `tokens` (`token`, `user_id`, `created_at`) VALUES
('0a90ac0d38c324430a4c8c49e1f0de32a6ca8168be9aa325ba4af52bebe17300', 2, '2025-05-02 15:14:58'),
('0e4fe4f404d18c86358778b21f2a054226de3521b0435530130b95ef318b5052', 4, '2025-05-01 08:10:30'),
('15c7a85b608dd2b48cb9a70b63e07392821c0704ece056b476975cd6e4f1b2ea', 2, '2025-05-02 15:16:08'),
('25f89708cb555cb0b5e920220bfd797383a0f80b3a16b72ee9f2bcb9e4e0c880', 2, '2025-05-02 15:12:19'),
('411b4ec5b00e485e05c85527a2d84a92d0834f85b1dde22a9edb21e0a2e533a4', 2, '2025-05-02 15:14:20'),
('7a6d6fedccccecbc161f3dff6bda4aa3e76a81023fd3af1b760929b237753402', 11, '2025-05-01 06:21:39'),
('b4df9a157d70a23f78e3ef9772f24b473d5e5ffb75aaeb1b2ccdd5fe7c04a285', 2, '2025-05-02 15:15:24'),
('ba53541df9e7ce650479c3d443206aab4631c8ca480183e5bc900803f18bce40', 2, '2025-05-02 15:08:32'),
('dfe30419a841fe97e1860d97698cc5a2ed4323d6203f03cecb6799e378251a56', 2, '2025-05-02 14:50:08'),
('e1d7dd2c62f8791ccc7f21347e428511137dcd48b95395abf54efa9c12d3302e', 2, '2025-05-02 15:12:20'),
('e5be20c7f24e32dce91325eed8a77edb07e016e0bbe99a39092d742398dc93a4', 2, '2025-05-01 05:38:08'),
('eaf13a8e987fef35cdeb0bb0c10c624f95d1a44ebe81214821cb0114e739763f', 1, '2025-05-01 05:22:34'),
('eeee2ed23309a0085a476cef32d251eb5be0ce2b26044d4caaa47834bc276462', 2, '2025-05-02 15:12:39'),
('f816b31c369110c6eee7fc33e4362089bf469b45e2ad357037e6c60ae85368da', 4, '2025-05-01 14:22:42'),
('fc4fc26a33d55da4b4f02460c9a6c65964657c1f346d712c7926ad6a52c038aa', 2, '2025-05-03 07:16:05');

-- --------------------------------------------------------

--
-- Table structure for table `user`
--

CREATE TABLE `user` (
  `user_id` int(11) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `contact` varchar(20) DEFAULT NULL,
  `role` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `user`
--

INSERT INTO `user` (`user_id`, `name`, `email`, `password`, `contact`, `role`) VALUES
(1, 'organizer1', 'organizer@organ.com', '$2b$10$yZJySf6ozd4syXF/6T38De7TrU0zhJnecWwoNSxgl4Foq3qrwdk7C', '03333333', 'organizer'),
(2, 'admin', 'admin@admin.com', '$2b$10$j56gQs3kr7FGTcu2SSrz0.2PqTqNP.QvoXwf9CtVMR89jL3PEDLmG', '03333333', 'admin'),
(4, 'student1', 'student1@student.com', '$2b$10$bk2S2E2YP23Bl/Iaor4iWeElg6j0xsi5khR4vJdqrbvMGA9Nq7rjG', '03333333', 'student'),
(5, 'student2', 'student2@student.com', '$2b$10$zU5K/UE.Dn.VfuS4GJU.yOqn.NLxBSqTbNQqSDTRW7GXcMDBbGAuy', '03333333', 'student'),
(6, 'student3', 'student3@student.com', '$2b$10$8Abovu6kN9nKe8o1cnVHbeHKdQjbsdpIMv7PUjfcUIA1RyTDxo2aW', '03333333', 'student'),
(7, 'student4', 'student4@student.com', '$2b$10$MOL3PRHgVcFHasH5h/ym3utiJ7xxTWCnw9dxhDtDU8F/cTG9j4PJi', '03333333', 'student'),
(8, 'student5', 'student5@student.com', '$2b$10$BaulrIzjq4d9FKraDL3ur.ZkZSlHxKTCN2uNT/xRIinL8iSnragmC', '03333333', 'student'),
(9, 'student6', 'student6@student.com', '$2b$10$.K.JbpRiL6Ug1L7LkDpTRuunlMBz9CoyT6FHNB/Z5HXL/xWDY6efy', '03333333', 'student'),
(10, 'student7', 'student7@student.com', '$2b$10$E7NI8T50ElIuwcelpe5mz.r1NO1u.hk4igENXLgoSzYVtt4yBIxGe', '03333333', 'student'),
(11, 'sponsor1', 'sponsor1@sponsor.com', '$2b$10$wY1G0wthmEuPhcDtONvehu4stQlwgganywVE9J.vSCSZZHTy6.fli', '03333333', 'sponsor');

-- --------------------------------------------------------

--
-- Table structure for table `venue`
--

CREATE TABLE `venue` (
  `venue_id` int(11) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `type` varchar(50) DEFAULT NULL,
  `capacity` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `venue`
--

INSERT INTO `venue` (`venue_id`, `name`, `location`, `type`, `capacity`) VALUES
(1, 'c301', 'C block', 'room', 10);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `accommodation`
--
ALTER TABLE `accommodation`
  ADD PRIMARY KEY (`accommodation_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `event`
--
ALTER TABLE `event`
  ADD PRIMARY KEY (`event_id`),
  ADD KEY `organizer_id` (`organizer_id`);

--
-- Indexes for table `event_round`
--
ALTER TABLE `event_round`
  ADD PRIMARY KEY (`event_round_id`),
  ADD KEY `event_id` (`event_id`),
  ADD KEY `venue_id` (`venue_id`);

--
-- Indexes for table `judge`
--
ALTER TABLE `judge`
  ADD PRIMARY KEY (`judge_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `event_round_id` (`event_round_id`);

--
-- Indexes for table `participant`
--
ALTER TABLE `participant`
  ADD PRIMARY KEY (`participant_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `event_id` (`event_id`);

--
-- Indexes for table `payment`
--
ALTER TABLE `payment`
  ADD PRIMARY KEY (`payment_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `sponsorship_id` (`sponsorship_id`),
  ADD KEY `accommodation_id` (`accommodation_id`);

--
-- Indexes for table `score`
--
ALTER TABLE `score`
  ADD PRIMARY KEY (`score_id`),
  ADD KEY `event_round_id` (`event_round_id`);

--
-- Indexes for table `sponsor`
--
ALTER TABLE `sponsor`
  ADD PRIMARY KEY (`sponsor_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `sponsorship`
--
ALTER TABLE `sponsorship`
  ADD PRIMARY KEY (`id`),
  ADD KEY `sponsor_id` (`sponsor_id`),
  ADD KEY `package_id` (`package_id`);

--
-- Indexes for table `sponsorship_package`
--
ALTER TABLE `sponsorship_package`
  ADD PRIMARY KEY (`package_id`);

--
-- Indexes for table `tokens`
--
ALTER TABLE `tokens`
  ADD PRIMARY KEY (`token`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `user`
--
ALTER TABLE `user`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `venue`
--
ALTER TABLE `venue`
  ADD PRIMARY KEY (`venue_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `accommodation`
--
ALTER TABLE `accommodation`
  MODIFY `accommodation_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `event`
--
ALTER TABLE `event`
  MODIFY `event_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `event_round`
--
ALTER TABLE `event_round`
  MODIFY `event_round_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `judge`
--
ALTER TABLE `judge`
  MODIFY `judge_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `participant`
--
ALTER TABLE `participant`
  MODIFY `participant_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `payment`
--
ALTER TABLE `payment`
  MODIFY `payment_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `score`
--
ALTER TABLE `score`
  MODIFY `score_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `sponsor`
--
ALTER TABLE `sponsor`
  MODIFY `sponsor_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `sponsorship`
--
ALTER TABLE `sponsorship`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `sponsorship_package`
--
ALTER TABLE `sponsorship_package`
  MODIFY `package_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `user`
--
ALTER TABLE `user`
  MODIFY `user_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `venue`
--
ALTER TABLE `venue`
  MODIFY `venue_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `accommodation`
--
ALTER TABLE `accommodation`
  ADD CONSTRAINT `accommodation_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`);

--
-- Constraints for table `event`
--
ALTER TABLE `event`
  ADD CONSTRAINT `event_ibfk_1` FOREIGN KEY (`organizer_id`) REFERENCES `user` (`user_id`);

--
-- Constraints for table `event_round`
--
ALTER TABLE `event_round`
  ADD CONSTRAINT `event_round_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `event` (`event_id`),
  ADD CONSTRAINT `event_round_ibfk_2` FOREIGN KEY (`venue_id`) REFERENCES `venue` (`venue_id`);

--
-- Constraints for table `judge`
--
ALTER TABLE `judge`
  ADD CONSTRAINT `judge_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`),
  ADD CONSTRAINT `judge_ibfk_2` FOREIGN KEY (`event_round_id`) REFERENCES `event_round` (`event_round_id`);

--
-- Constraints for table `participant`
--
ALTER TABLE `participant`
  ADD CONSTRAINT `participant_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`),
  ADD CONSTRAINT `participant_ibfk_2` FOREIGN KEY (`event_id`) REFERENCES `event` (`event_id`);

--
-- Constraints for table `payment`
--
ALTER TABLE `payment`
  ADD CONSTRAINT `payment_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`),
  ADD CONSTRAINT `payment_ibfk_2` FOREIGN KEY (`sponsorship_id`) REFERENCES `sponsorship` (`id`),
  ADD CONSTRAINT `payment_ibfk_3` FOREIGN KEY (`accommodation_id`) REFERENCES `accommodation` (`accommodation_id`);

--
-- Constraints for table `score`
--
ALTER TABLE `score`
  ADD CONSTRAINT `score_ibfk_1` FOREIGN KEY (`event_round_id`) REFERENCES `event_round` (`event_round_id`);

--
-- Constraints for table `sponsor`
--
ALTER TABLE `sponsor`
  ADD CONSTRAINT `sponsor_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`);

--
-- Constraints for table `sponsorship`
--
ALTER TABLE `sponsorship`
  ADD CONSTRAINT `sponsorship_ibfk_1` FOREIGN KEY (`sponsor_id`) REFERENCES `sponsor` (`sponsor_id`),
  ADD CONSTRAINT `sponsorship_ibfk_2` FOREIGN KEY (`package_id`) REFERENCES `sponsorship_package` (`package_id`);

--
-- Constraints for table `tokens`
--
ALTER TABLE `tokens`
  ADD CONSTRAINT `tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE;

DELIMITER $$
--
-- Events
--
CREATE DEFINER=`root`@`localhost` EVENT `remove_unpaid_participants` ON SCHEDULE EVERY 1 DAY STARTS '2025-05-04 00:00:00' ON COMPLETION NOT PRESERVE ENABLE DO BEGIN
      DELETE FROM participant
      WHERE payment_status = FALSE;
    END$$

CREATE DEFINER=`root`@`localhost` EVENT `close_registration_2_days_left` ON SCHEDULE EVERY 1 DAY STARTS '2025-05-04 00:00:00' ON COMPLETION NOT PRESERVE ENABLE DO BEGIN
      UPDATE event
      SET registration_open = FALSE
      WHERE registration_open = TRUE AND registration_deadline <= NOW() + INTERVAL 2 DAY;
    END$$

DELIMITER ;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
