import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { SessionSummary } from './SessionSummary';
import { useStudyStore, type AnswerLog, type QueueItem } from './study-store';
import '../../index.css';
import '../../pages/dashboard.css';
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const scenario = params.get('state') ?? 'mixed';
const answers: AnswerLog[] = [
  {cardId:'text',direction:'term_to_def',term:'Что такое **случайная величина**?',definition:'Функция, которая каждому исходу случайного эксперимента ставит в соответствие число.',rating:1,correct:false,typed:'Число, которое нельзя предсказать.'},
  {cardId:'formula',direction:'term_to_def',term:'E[X]',definition:'\\sum_{i=1}^{n}x_i p_i',rating:1,correct:false,typed:'Сумма значений'},
  {cardId:'code',direction:'term_to_def',term:'values = [2, 4, 6]',definition:'mean = sum(values) / len(values)\nprint(mean)',rating:1,correct:false,typed:'sum(values)'},
  {cardId:'image',direction:'term_to_def',term:'Поясните график',definition:'Частота встречаемости каждого значения.',rating:1,correct:false},
  {cardId:'long',direction:'term_to_def',term:'Длинное определение',definition:'Подробное объяснение с формулой $x^2$ и `кодом`. '.repeat(20),rating:1,correct:false,typed:'НепрерывнаяПоследовательность'.repeat(20)},
  {cardId:'correct',direction:'term_to_def',term:'Верный ответ',definition:'Да',rating:3,correct:true},
];
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100"><rect width="240" height="100" fill="white"/><path d="M20 80V20m0 60h200M40 80V60h30v20m20 0V30h30v50m20 0V45h30v35" stroke="black" fill="none"/></svg>');
useStudyStore.setState({ mode:'write', items:answers.map(a=>({card:{id:a.cardId,content_type:a.cardId==='formula'?'latex':a.cardId==='code'?'code':'text',code_language:'python',term_image_url:a.cardId==='image'?image:null,definition_image_url:a.cardId==='image'?image:null}} as QueueItem)) });
const displayed = scenario==='zero'?[]:scenario==='success'?answers.map(a=>({...a,correct:true})):scenario==='errors'?answers.map(a=>({...a,correct:false})):answers;
createRoot(document.getElementById('root')!).render(<MemoryRouter><main className="dashboard-shell" style={{padding:'24px',background:'rgb(var(--rm-bg))',minHeight:'100vh'}}><SessionSummary setId="preview" answers={displayed} nextDueSeconds={scenario==='zero'?undefined:3600} backHref={params.has('folder')?'/materials?folder=review':undefined} backLabel={params.has('folder')?'К папке':undefined} onRestart={()=>{document.body.dataset.action='restart'}} onRepeatMistakes={()=>{document.body.dataset.action='mistakes'}} /></main></MemoryRouter>);
