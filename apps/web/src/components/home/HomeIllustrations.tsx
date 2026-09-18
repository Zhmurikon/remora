import { FishMark } from '@remora/ui';
import { HomeIcon } from './HomeIcon';

export function NotesIllustration() {
  return (
    <div
      className="home-notes-scene"
      role="img"
      aria-label="Пример: конспект о фотосинтезе и созданная по нему карточка с вопросом и ответом"
    >
      <div className="home-paper">
        <div className="home-paper-bar">
          <HomeIcon name="book" />
          Мой конспект<span>···</span>
        </div>
        <h3>Фотосинтез</h3>
        <p>
          Растения используют <mark>энергию света</mark>, чтобы создавать органические вещества из
          воды и углекислого газа.
        </p>
        <div className="home-paper-lines">
          <i />
          <i />
          <i />
        </div>
        <span className="home-handwritten">Выделите главное</span>
      </div>
      <svg className="home-drawn-arrow" viewBox="0 0 100 55" aria-hidden="true">
        <path
          d="M5 20C40-10 75 10 85 40m-17-9 18 11 3-20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <div className="home-editor-card">
        <div className="home-paper-bar">
          <HomeIcon name="cards" />
          Новая карточка
        </div>
        <span className="home-mini-label">Вопрос</span>
        <p>Что такое фотосинтез?</p>
        <span className="home-mini-label">Ответ</span>
        <p>Преобразование энергии света в химическую энергию.</p>
        <span className="home-saved">
          <HomeIcon name="check" />
          Готово к повторению
        </span>
      </div>
      <HomeIcon name="leaf" className="home-scene-leaf" />
    </div>
  );
}

export function ChatIllustration() {
  return (
    <div
      className="home-chat-scene"
      role="img"
      aria-label="Примеры обучения: вопрос бота Remora в Telegram и верный ответ во ВКонтакте"
    >
      <div className="home-chat">
        <div className="home-chat-header">
          <span className="home-chat-avatar">
            <HomeIcon name="telegram" />
          </span>
          <div>
            <strong>Remora</strong>
            <small>Telegram · бот</small>
          </div>
          <span>···</span>
        </div>
        <span className="home-chat-date">Пример занятия</span>
        <div className="home-bubble">
          Как переводится
          <br />
          <strong>knowledge</strong>?
        </div>
        <div className="home-chat-choices">
          <span>А · Знание</span>
          <span>Б · Вопрос</span>
        </div>
        <div className="home-bubble home-bubble-self">
          А · Знание <HomeIcon name="check" />
        </div>
      </div>
      <div className="home-chat home-chat-vk">
        <div className="home-chat-header">
          <span className="home-chat-avatar home-vk">VK</span>
          <div>
            <strong>Remora</strong>
            <small>ВКонтакте · бот</small>
          </div>
          <span>···</span>
        </div>
        <span className="home-chat-date">Пример занятия</span>
        <div className="home-bubble">
          Верно!
          <br />
          <strong>Knowledge — знание.</strong>
        </div>
        <div className="home-chat-next">
          Следующий вопрос
          <HomeIcon name="arrow" />
        </div>
        <p className="home-chat-foot">
          <HomeIcon name="check" />
          Ответ сохранён
        </p>
      </div>
    </div>
  );
}

export function ImportIllustration() {
  return (
    <div
      className="home-import-scene"
      role="img"
      aria-label="Пример импорта: файл CSV с терминами и определениями превращается в набор карточек"
    >
      <div className="home-file">
        <HomeIcon name="upload" />
        <strong>Мои термины.csv</strong>
        <span>Термин + определение</span>
      </div>
      <span className="home-import-arrow">
        <HomeIcon name="arrow" />
      </span>
      <div className="home-import-table">
        <div className="home-paper-bar">
          <HomeIcon name="cards" />
          Предпросмотр импорта
        </div>
        <div>
          <strong>Термин</strong>
          <strong>Определение</strong>
        </div>
        <div>
          <span>Knowledge</span>
          <span>Знание</span>
        </div>
        <div>
          <span>Memory</span>
          <span>Память</span>
        </div>
        <div>
          <span>Learning</span>
          <span>Обучение</span>
        </div>
        <span className="home-saved">
          <HomeIcon name="check" />
          Три карточки в этом примере
        </span>
      </div>
    </div>
  );
}

export function AiIllustration() {
  return (
    <div
      className="home-ai-scene"
      role="img"
      aria-label="Свой ИИ-помощник получает задание создать курс, а Remora хранит теорию и карточки"
    >
      <div className="home-ai-prompt">
        <span className="home-mini-label">
          <HomeIcon name="spark" />
          Ваш ИИ-помощник
        </span>
        <p>Собери по моему конспекту курс: краткую теорию и карточки для повторения.</p>
        <span className="home-prompt-file">
          <HomeIcon name="book" />
          Конспект лекции
        </span>
      </div>
      <span className="home-ai-connector" aria-hidden="true">
        ↓
      </span>
      <div className="home-ai-course">
        <span className="home-brand">
          <FishMark />
          Remora
        </span>
        <div>
          <HomeIcon name="book" />
          <span>Теория по разделам</span>
          <HomeIcon name="check" />
        </div>
        <div>
          <HomeIcon name="cards" />
          <span>Карточки по теме</span>
          <HomeIcon name="check" />
        </div>
        <small>Сначала проверьте материал, затем учитесь</small>
      </div>
    </div>
  );
}

export function RepetitionIllustration() {
  return (
    <div
      className="home-repeat-scene"
      role="img"
      aria-label="Иллюстрация повторения: вспомнить слово сегодня и вернуться к нему позже по персональному расписанию"
    >
      <div className="home-repeat-card">
        <span className="home-mini-label">Английский</span>
        <strong>Knowledge</strong>
        <span>Знание</span>
        <span className="home-saved">
          <HomeIcon name="check" />
          Вспомнили
        </span>
      </div>
      <div className="home-timeline">
        <div>
          <span className="home-timeline-dot">
            <HomeIcon name="check" />
          </span>
          <strong>Сегодня</strong>
          <small>Узнать</small>
        </div>
        <div>
          <span className="home-timeline-dot">
            <HomeIcon name="clock" />
          </span>
          <strong>Позже</strong>
          <small>Вспомнить</small>
        </div>
        <div>
          <span className="home-timeline-dot">
            <HomeIcon name="leaf" />
          </span>
          <strong>Надолго</strong>
          <small>Закрепить</small>
        </div>
      </div>
      <p className="home-muted">Интервалы подстраиваются под ваши ответы</p>
    </div>
  );
}
