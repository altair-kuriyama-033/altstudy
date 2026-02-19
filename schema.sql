-- Existing table (already present):
-- users(userid VARCHAR(64) PRIMARY KEY, display_name VARCHAR(128), password_hash VARCHAR(255) NOT NULL)

CREATE TABLE IF NOT EXISTS chapters (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(userid)
);

CREATE TABLE IF NOT EXISTS questions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  chapter_id BIGINT NOT NULL,
  question_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS choices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  question_id BIGINT NOT NULL,
  choice_key CHAR(1) NOT NULL,
  choice_text TEXT NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  UNIQUE KEY uq_question_choice (question_id, choice_key)
);

CREATE TABLE IF NOT EXISTS chapter_scores (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  chapter_id BIGINT NOT NULL,
  userid VARCHAR(64) NOT NULL,
  correct_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  FOREIGN KEY (userid) REFERENCES users(userid),
  UNIQUE KEY uq_chapter_user (chapter_id, userid)
);
