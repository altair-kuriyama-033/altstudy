require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');
const { requireAuth } = require('./auth');

const app = express();
const port = Number(process.env.PORT || 3000);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  return res.redirect('/chapters');
});

app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/chapters');
  }
  return res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { userid, password } = req.body;

  if (!userid || !password) {
    return res.status(400).render('login', { error: 'ユーザーIDとパスワードを入力してください。' });
  }

  const [rows] = await pool.query('SELECT userid, display_name, password_hash FROM users WHERE userid = ?', [userid]);

  if (rows.length === 0) {
    return res.status(401).render('login', { error: 'ユーザーIDまたはパスワードが違います。' });
  }

  const user = rows[0];
  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    return res.status(401).render('login', { error: 'ユーザーIDまたはパスワードが違います。' });
  }

  req.session.user = {
    userid: user.userid,
    displayName: user.display_name || user.userid
  };

  return res.redirect('/chapters');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/chapters', requireAuth, async (req, res) => {
  const [chapters] = await pool.query(
    'SELECT id, title, description, created_by, created_at FROM chapters ORDER BY created_at DESC'
  );

  return res.render('chapters', { chapters });
});

app.get('/chapters/new', requireAuth, (req, res) => {
  res.render('chapter_new', { error: null, values: { title: '', description: '', questions: [] } });
});

app.post('/chapters/new', requireAuth, async (req, res) => {
  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim();
  const questionTexts = Array.isArray(req.body.questionText)
    ? req.body.questionText
    : [req.body.questionText].filter(Boolean);

  const optionAList = Array.isArray(req.body.optionA) ? req.body.optionA : [req.body.optionA].filter(Boolean);
  const optionBList = Array.isArray(req.body.optionB) ? req.body.optionB : [req.body.optionB].filter(Boolean);
  const optionCList = Array.isArray(req.body.optionC) ? req.body.optionC : [req.body.optionC].filter(Boolean);
  const optionDList = Array.isArray(req.body.optionD) ? req.body.optionD : [req.body.optionD].filter(Boolean);
  const answerList = Array.isArray(req.body.correctChoice) ? req.body.correctChoice : [req.body.correctChoice].filter(Boolean);

  if (!title || questionTexts.length === 0) {
    return res.status(400).render('chapter_new', {
      error: '章タイトルと1問以上の問題を入力してください。',
      values: { title, description, questions: [] }
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [chapterResult] = await connection.query(
      'INSERT INTO chapters (title, description, created_by) VALUES (?, ?, ?)',
      [title, description, req.session.user.userid]
    );

    const chapterId = chapterResult.insertId;

    for (let i = 0; i < questionTexts.length; i += 1) {
      const questionText = (questionTexts[i] || '').trim();
      const optionA = (optionAList[i] || '').trim();
      const optionB = (optionBList[i] || '').trim();
      const optionC = (optionCList[i] || '').trim();
      const optionD = (optionDList[i] || '').trim();
      const correctChoice = (answerList[i] || '').trim();

      if (!questionText || !optionA || !optionB || !optionC || !optionD || !['A', 'B', 'C', 'D'].includes(correctChoice)) {
        throw new Error('invalid_question');
      }

      const [questionResult] = await connection.query(
        'INSERT INTO questions (chapter_id, question_text) VALUES (?, ?)',
        [chapterId, questionText]
      );

      const questionId = questionResult.insertId;
      const choices = [
        ['A', optionA],
        ['B', optionB],
        ['C', optionC],
        ['D', optionD]
      ];

      for (const [choiceKey, choiceText] of choices) {
        await connection.query(
          'INSERT INTO choices (question_id, choice_key, choice_text, is_correct) VALUES (?, ?, ?, ?)',
          [questionId, choiceKey, choiceText, choiceKey === correctChoice ? 1 : 0]
        );
      }
    }

    await connection.commit();
    return res.redirect('/chapters');
  } catch (error) {
    await connection.rollback();
    const message = error.message === 'invalid_question'
      ? '問題文・選択肢・正解をすべて正しく入力してください。'
      : '章の登録に失敗しました。';

    return res.status(400).render('chapter_new', {
      error: message,
      values: { title, description, questions: [] }
    });
  } finally {
    connection.release();
  }
});

app.get('/chapters/:chapterId/quiz', requireAuth, async (req, res) => {
  const chapterId = Number(req.params.chapterId);
  const [chapterRows] = await pool.query('SELECT id, title FROM chapters WHERE id = ?', [chapterId]);

  if (chapterRows.length === 0) {
    return res.status(404).send('Chapter not found');
  }

  const [questions] = await pool.query(
    `SELECT q.id AS question_id, q.question_text, c.choice_key, c.choice_text
     FROM questions q
     JOIN choices c ON c.question_id = q.id
     WHERE q.chapter_id = ?
     ORDER BY q.id ASC, c.choice_key ASC`,
    [chapterId]
  );

  const questionMap = new Map();
  for (const row of questions) {
    if (!questionMap.has(row.question_id)) {
      questionMap.set(row.question_id, {
        questionId: row.question_id,
        questionText: row.question_text,
        choices: []
      });
    }
    questionMap.get(row.question_id).choices.push({
      choiceKey: row.choice_key,
      choiceText: row.choice_text
    });
  }

  return res.render('quiz', {
    chapter: chapterRows[0],
    questions: Array.from(questionMap.values())
  });
});

app.post('/chapters/:chapterId/quiz', requireAuth, async (req, res) => {
  const chapterId = Number(req.params.chapterId);
  const answers = req.body.answers || {};

  const [correctRows] = await pool.query(
    `SELECT q.id AS question_id, c.choice_key
     FROM questions q
     JOIN choices c ON c.question_id = q.id
     WHERE q.chapter_id = ? AND c.is_correct = 1`,
    [chapterId]
  );

  let correctCount = 0;
  for (const row of correctRows) {
    const submitted = answers[row.question_id];
    if (submitted === row.choice_key) {
      correctCount += 1;
    }
  }

  await pool.query(
    `INSERT INTO chapter_scores (chapter_id, userid, correct_count)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       correct_count = GREATEST(correct_count, VALUES(correct_count)),
       updated_at = CURRENT_TIMESTAMP`,
    [chapterId, req.session.user.userid, correctCount]
  );

  return res.redirect(`/chapters/${chapterId}/ranking`);
});

app.get('/chapters/:chapterId/ranking', requireAuth, async (req, res) => {
  const chapterId = Number(req.params.chapterId);

  const [chapterRows] = await pool.query('SELECT id, title FROM chapters WHERE id = ?', [chapterId]);
  if (chapterRows.length === 0) {
    return res.status(404).send('Chapter not found');
  }

  const [rankings] = await pool.query(
    `SELECT cs.userid, COALESCE(u.display_name, cs.userid) AS display_name, cs.correct_count, cs.updated_at
     FROM chapter_scores cs
     LEFT JOIN users u ON u.userid = cs.userid
     WHERE cs.chapter_id = ?
     ORDER BY cs.correct_count DESC, cs.updated_at ASC`,
    [chapterId]
  );

  return res.render('ranking', {
    chapter: chapterRows[0],
    rankings
  });
});

app.use((error, req, res, next) => {
  if (error) {
    console.error(error);
    return res.status(500).send('Internal Server Error');
  }
  return next();
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
