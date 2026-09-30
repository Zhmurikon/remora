import Image from 'next/image';
import mascot from '../../../../../assets/brand/source/remora-mascot-source.png';

const faqs = [
  [
    'Обучение действительно бесплатное?',
    'Да. Все пять режимов обучения и повторения доступны бесплатно. Можно учиться по своим наборам без ограничения числа повторений.',
  ],
  [
    'Как добавить свои материалы?',
    'Создайте карточки вручную или импортируйте CSV, TSV либо набор Anki. Перед сохранением можно проверить результат и исправить карточки. Теорию и наборы можно объединить в курс.',
  ],
  [
    'Можно подключить свою нейросеть?',
    'Да, если ваш ИИ-помощник поддерживает MCP или работу с API. Подключение настраивается в кабинете, в разделе «API и ИИ-агенты». Модель работает на стороне вашего помощника; её доступ и стоимость зависят от выбранного сервиса.',
  ],
  [
    'Как учиться в Telegram и ВКонтакте?',
    'Зарегистрируйтесь в Remora и привяжите бота в настройках аккаунта. После этого в чате можно открыть свои материалы и начать обучение. Ответы учитываются в общем учебном прогрессе.',
  ],
  [
    'Сохранится ли результат демо?',
    'Демо работает прямо на этой странице без аккаунта. Его результат не сохраняется после перезагрузки. Для постоянного учебного прогресса зарегистрируйтесь и начните занятие по своему набору.',
  ],
] as const;

export function HomeFaq() {
  return (
    <section
      id="questions"
      className="home-faq home-shell"
      aria-labelledby="faq-title"
      data-home-faq
    >
      <svg
        className="home-faq-route"
        viewBox="0 0 1600 780"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          data-home-faq-route
          pathLength="1"
          d="M290-30C294 102 324 172 506 184S620 280 560 360 402 442 332 448"
        />
        <path d="M-50 548C90 600 144 738 272 818" />
        <circle cx="506" cy="184" r="8" />
      </svg>

      <div className="home-faq-intro">
        <span className="home-kicker">Перед началом</span>
        <h2 id="faq-title">Остались вопросы?</h2>
        <div className="home-faq-mascot" aria-hidden="true">
          <span className="home-faq-mascot-leaf home-faq-mascot-leaf-one" />
          <span className="home-faq-mascot-leaf home-faq-mascot-leaf-two" />
          <span className="home-faq-mascot-platform" />
          <Image src={mascot} alt="" sizes="(max-width: 800px) 180px, 340px" />
          <i />
        </div>
      </div>

      <div className="home-faq-list">
        {faqs.map(([question, answer], index) => (
          <details key={question} open={index === 0}>
            <summary>
              <span className="home-faq-question">{question}</span>
              <span className="home-faq-toggle" aria-hidden="true" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
