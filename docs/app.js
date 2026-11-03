import { LESSONS } from './content.js?v=20261103-fun';
import { AUDIO_FILES } from './audio-map.js?v=20261103-fun';
import { GAME_CONFIGS, DELIVERY_ORDERS, createDeliveryRound, createPairDeck, evaluatePair } from './playground.js?v=20261103-fun';
import { createInitialState, loadState, saveState, completeLesson, completeGame, getDueWords, recordReview, getStats } from './engine.js?v=20261103-fun';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  leaf:'<path d="M19 3C8 2 3 7 5 15c8 5 15-1 14-12Z"/><path d="M4 21 15 10"/>',
  repeat:'<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
  parent:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  sound:'<path d="m11 4-5 4H2v8h4l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  book:'<path d="M12 5Q6 2 2 5v15q5-3 10 0 5-3 10 0V5q-4-3-10 0Zm0 0v15"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  heart:'<path d="M12 21C-6 10 6-3 12 6 18-3 30 10 12 21Z"/>',
  spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>'
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.leaf}</svg>`;
const primary = (label, action, attrs='') => `<button class="primary-btn" data-action="${action}" ${attrs}>${label}${icon('arrow')}</button>`;
const secondary = (label, action, attrs='') => `<button class="secondary-btn" data-action="${action}" ${attrs}>${label}</button>`;
const speaker = (text, label='听一听', cls='speaker-btn') => `<button class="${cls}" data-speak="${esc(text)}" aria-label="${esc(label)}">${icon('sound')}</button>`;
let storage;
try { storage = window.localStorage; } catch { storage = { getItem(){return null;}, setItem(){throw new Error('Storage unavailable');} }; }
let state = loadState(storage);
let page = 'home';
let lesson = null;
let review = null;
let game = null;
let lessonFilter = 'all';
let exitPromptOpen = false;
let storageOk = true;
let resetPending = false;
let voiceProblem = '';
let voiceWasTested = false;
let audioEpoch = 0;
let toastTimer;
let previousFocus;
let audioTimeout;
let activeAudio;
const allWords = LESSONS.flatMap(l => l.words.map(w => ({...w, lessonId:l.id})));

function persist() {
  const result = saveState(storage, state);
  storageOk = result.ok;
  if (!storageOk) toast('这次进步暂时只能保留到页面关闭。请让家长检查浏览器的存储设置。');
  return result.ok;
}
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 5000);
}
function cancelAudio() {
  audioEpoch++;
  clearTimeout(audioTimeout);
  if(activeAudio) { activeAudio.pause(); activeAudio.removeAttribute('src'); activeAudio.load(); activeAudio=null; }
  window.speechSynthesis?.cancel();
  document.querySelectorAll('.is-speaking').forEach(el => el.classList.remove('is-speaking'));
}
function englishVoice() {
  return window.speechSynthesis?.getVoices().filter(v => /^en(?:[-_]|$)/i.test(v.lang)).sort((a,b) => Number(b.localService)-Number(a.localService) || Number(b.lang==='en-US')-Number(a.lang==='en-US'))[0];
}
function audioHelp() {
  if(game?.stage==='play'&&game.id==='pairs')return '可以点“看看词语提示”，让翻开的声音卡显示文字。';
  if(game?.stage==='play'&&game.id==='delivery')return '可以点“想看一点提示”继续。';
  if(lesson?.peek)return '可以先看图片和中文，再回到刚才的任务。';
  if(review||lesson?.step===2)return '可以点“看文字提示”继续。';
  if(lesson?.step===3)return '可以点“给我一点提示”，也可以先听到这里。';
  return '可以看图和中文继续，也可以请家长检查声音。';
}
function audioNotice() {
  return voiceProblem ? `<div class="audio-status" role="status">${esc(voiceProblem)} ${audioHelp()}</div>` : '';
}
function speak(text, button, fallback=false) {
  cancelAudio();
  voiceWasTested = true;
  if(AUDIO_FILES[text] && !fallback) {
    const audio=new Audio(AUDIO_FILES[text]); activeAudio=audio;
    audio.playbackRate=state.settings.slowAudio ? .88 : 1;
    const epoch=audioEpoch;
    audio.onplaying=()=>{if(epoch===audioEpoch){voiceProblem='';$('.audio-status')?.remove();button?.classList.add('is-speaking');}};
    audio.onended=()=>{if(epoch===audioEpoch){clearTimeout(audioTimeout);button?.classList.remove('is-speaking');activeAudio=null;}};
    audio.onerror=()=>{if(epoch===audioEpoch)speak(text,button,true);};
    audioTimeout=setTimeout(()=>{if(epoch===audioEpoch)speak(text,button,true);},20000);
    audio.play().catch(()=>{if(epoch===audioEpoch)speak(text,button,true);});
    return;
  }
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    audioFail('这台设备暂不支持朗读。'); return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = englishVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = 'en-US'; utterance.rate = state.settings.slowAudio ? .78 : .95; utterance.pitch = 1.03;
  const epoch = audioEpoch;
  utterance.onstart = () => { if (epoch !== audioEpoch) return; voiceProblem = ''; $('.audio-status')?.remove(); button?.classList.add('is-speaking'); };
  utterance.onend = () => { if(epoch !== audioEpoch) return; clearTimeout(audioTimeout); button?.classList.remove('is-speaking'); };
  utterance.onerror = event => { if(epoch !== audioEpoch || ['interrupted','canceled'].includes(event.error)) return; button?.classList.remove('is-speaking'); clearTimeout(audioTimeout); audioFail('英语声音没有播放成功，请再试一次。'); };
  audioTimeout = setTimeout(() => { if(epoch === audioEpoch) { cancelAudio(); audioFail('还没听到声音？请检查设备音量和英语语音设置。'); } }, 16000);
  try { window.speechSynthesis.speak(utterance); } catch { audioFail('英语声音没有播放成功。'); }
}
function audioFail(message) {
  voiceProblem = message;
  toast(`${message} 家长可以在“家长小站”里检查声音。`);
  if (lesson || review || game) {
    const target = $('.audio-status');
    if(target) target.textContent = `${message} ${audioHelp()}`;
    else $('.adventure-body')?.insertAdjacentHTML('afterbegin', audioNotice());
  }
}
function go(next) { cancelAudio(); page = next; resetPending=false; render(); window.scrollTo({top:0,behavior:'instant'}); $('#main')?.focus({preventScroll:true}); }
function header(title, description, kicker='A LITTLE ENGLISH, A LITTLE WONDER') {
  return `<div class="welcome"><div><div class="eyebrow">${icon('leaf')}${kicker}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><span class="date-note">${new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}</span></div>`;
}
function render() {
  const due = getDueWords(state);
  const labels={home:'去探险',collection:'我的发现',review:'轻松复习',parent:'家长小站',research:'设计依据'};
  $('#app').innerHTML = `<div class="shell"><aside class="sidebar"><a class="brand" href="#" data-page="home" aria-label="森语探险首页"><img src="./favicon.svg" class="brand-mark" alt=""><div><strong>森语探险</strong><small>Little English</small></div></a><div class="nav-label">我的森林 / MY FOREST</div><nav class="nav" aria-label="主导航">${[['home','compass','去探险'],['collection','leaf','我的发现'],['review','repeat','轻松复习']].map(([id,ic,label])=>`<button class="nav-btn ${page===id?'active':''}" data-page="${id}" ${page===id?'aria-current="page"':''} aria-label="${label}">${icon(ic)}<span class="nav-text">${label}</span>${id==='review'&&due.length?'<span class="nav-dot"></span>':''}</button>`).join('')}</nav><div class="sidebar-note"><span class="sprout" aria-hidden="true">🌱</span><p><strong>每一棵大树，</strong>都从小小的芽开始。<br>今天的一点点，也很棒。</p></div><div class="sidebar-foot"><button class="nav-btn ${page==='parent'||page==='research'?'active':''}" data-page="parent">${icon('parent')}家长小站</button></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb">我的森林 <span>/</span><b>${labels[page]}</b></div><div class="top-actions"><div class="calm-pill">${icon('leaf')}慢慢来，每天一点点</div><button class="text-btn mobile-parent" data-page="parent" aria-label="家长小站">${icon('parent')}</button><div class="avatar" title="小小探险家" aria-hidden="true">🦊</div></div></header><main id="main" tabindex="-1">${!storageOk?'<div class="warning" role="status">浏览器暂时无法保存进度。可以继续玩，关闭页面后本次记录可能会丢失；请让家长检查存储设置。</div>':''}${({home:homePage,collection:collectionPage,review:reviewPage,parent:parentPage,research:researchPage}[page]||homePage)()}</main><footer class="bottom-note"><span>森语探险 · 把好奇心，变成学习的开始。</span><button class="text-btn" data-page="research">学习设计与来源 ${icon('arrow')}</button></footer></div></div>`;
}
function homePage() {
  const next = LESSONS.find(l => !state.lessonProgress[l.id]) || LESSONS[0];
  const done = Object.keys(state.lessonProgress).length;
  const due=getDueWords(state);
  const visibleLessons=LESSONS.filter(l=>lessonFilter==='all'||(lessonFilter==='new'?l.group==='new':l.group!=='new')).sort((a,b)=>Number(b.group==='new')-Number(a.group==='new'));
  return `${header(`嗨，${state.settings.name}！`,'准备好和森林朋友说 Hello 了吗？')}<section class="hero" aria-labelledby="hero-title"><div class="hero-copy"><span class="tiny-badge"><span class="mini-dot"></span> ${done?'下一站的小冒险':'今天的第一站'} · 约 5–8 分钟</span><h2 id="hero-title">森林里，<br>藏着新朋友。</h2><p>听听它们的声音，帮它们一个小忙。<br>英语，就从一句 Hello 开始。</p>${primary(done?'继续我的冒险':'出发，认识新朋友','start',`data-id="${next.id}"`)}<div class="hero-meta">${icon('heart')}不用全会，愿意试试就很棒</div></div><img class="hero-art" src="./forest.svg?v=20261103-polish" alt="小狐狸和兔子在绿色森林里向你问好"></section><div class="journey-strip"><div class="journey-item"><div class="journey-icon">${icon('sound')}</div><div><strong>先听听，别着急</strong><span>声音和画面，一起认识</span></div></div><div class="journey-item"><div class="journey-icon">${icon('compass')}</div><div><strong>玩一玩，认朋友</strong><span>帮小伙伴，完成小任务</span></div></div><div class="journey-item"><div class="journey-icon">${icon('spark')}</div><div><strong>说一句，也很棒</strong><span>跟着试试，慢慢敢开口</span></div></div></div>${due.length?`<div class="review-banner"><span class="emoji" aria-hidden="true">🌿</span><div><strong>${due.length} 个老朋友想见你</strong><p>先听一听，再看看还认不认识。</p></div>${secondary('去打个招呼','begin-review')}</div>`:''}${gameSection()}<section aria-labelledby="explore-title"><div class="section-top"><div><h2 id="explore-title">沿着好奇心出发</h2><p>喜欢哪一站，就从哪一站开始。</p></div><span class="quiet">${icon('leaf')}${LESSONS.length} 个小故事 · 随心选择</span></div><div class="lesson-filters" role="group" aria-label="选择故事"><button data-action="filter-lessons" data-filter="all" aria-pressed="${lessonFilter==='all'}">全部故事</button><button data-action="filter-lessons" data-filter="new" aria-pressed="${lessonFilter==='new'}">✨ 新冒险</button><button data-action="filter-lessons" data-filter="familiar" aria-pressed="${lessonFilter==='familiar'}">熟悉的老朋友</button></div><div class="lesson-grid">${visibleLessons.map(l=>`<button class="lesson-card" data-action="start" data-id="${l.id}" aria-label="开始${esc(l.title)}，3个词和1句话"><div class="lesson-art" style="--scene:${l.color}"><span class="lesson-num">CHAPTER ${String(LESSONS.indexOf(l)+1).padStart(2,'0')}</span>${state.lessonProgress[l.id]?'<span class="lesson-done">✓ 来过这里</span>':l.group==='new'?'<span class="lesson-done new-badge">新冒险</span>':''}<span class="scene-emoji" aria-hidden="true">${l.emoji}</span><span class="scene-side" aria-hidden="true">${l.sideEmoji||'🍃'}</span></div><div class="lesson-body"><h3>${esc(l.title)}${icon('arrow')}</h3><div class="lesson-english">${esc(l.subtitle)}</div><div class="lesson-meta"><span>3 个词 · 1 句表达</span><span>听 · 玩 · 说</span></div></div></button>`).join('')}</div></section>`;
}
function gameSection() {
  return `<section class="playground-section" aria-labelledby="playground-title"><div class="section-top"><div><div class="eyebrow">A LITTLE PLAY, A LITTLE DISCOVERY</div><h2 id="playground-title">森林游乐场，开门啦</h2><p>把认识的英语，放进好玩的小任务里。</p></div><span class="quiet">约 2–4 分钟 · 没有倒计时</span></div><div class="game-grid">${GAME_CONFIGS.map(g=>`<button class="game-card" data-action="start-game" data-id="${g.id}" style="--game-color:${g.color}" aria-label="玩${esc(g.title)}"><span class="game-card-art" aria-hidden="true">${g.emoji}</span><span class="game-card-copy"><span class="game-card-tag">${state.gameProgress?.[g.id]?'✓ 再来玩一次':'新玩法'}</span><strong>${esc(g.title)}</strong><small>${esc(g.subtitle)}</small><span class="game-card-link">我想玩 ${icon('arrow')}</span></span></button>`).join('')}</div></section>`;
}
function collectionPage() {
  const words=allWords.filter(w=>state.words[w.id]);
  const completed=Object.keys(state.lessonProgress).length;
  return `${header('我的小小发现','每一个见过的词，都是森林送你的小礼物。','MY LITTLE DISCOVERIES')}${words.length?`<div class="collection-header"><span class="big-emoji" aria-hidden="true">🌳</span><div><h2>你已经探索了 ${completed} 个小故事</h2><p>和 ${words.length} 个词打过招呼。点小喇叭，再听它们说一次。</p></div></div><div class="word-grid">${words.map(w=>`<article class="word-card">${getDueWords(state).some(d=>d.id===w.id)?'<span class="memory-label">再见一面</span>':''}<span class="word-emoji" aria-hidden="true">${w.emoji}</span><strong lang="en">${esc(w.text)}</strong><span>${esc(w.zh)}</span>${speaker(w.text,`听${w.text}的发音`)}</article>`).join('')}</div>`:`<div class="empty-card"><span class="empty-emoji" aria-hidden="true">🌱</span><h2>你的发现，从一声 Hello 开始</h2><p>去森林里走一走，<br>遇见的英语朋友就会来到这里。</p>${primary('去探险','go-home')}</div>`}`;
}
function reviewPage() {
  const due=getDueWords(state);
  const learned=allWords.filter(w=>state.words[w.id]);
  return `${header('和老朋友，再见一面','先听听，试着想一想。忘了也没关系，一起再认识一次。','HELLO AGAIN, OLD FRIENDS')}${due.length?`<div class="empty-card"><span class="empty-emoji" aria-hidden="true">🐦</span><h2>${due.length} 个老朋友，在等你</h2><p>每次最多见 6 个朋友。<br>不用赶时间，点开声音就能开始。</p>${primary('开始轻松复习','begin-review')}</div>`:`<div class="empty-card"><span class="empty-emoji" aria-hidden="true">🍃</span><h2>${learned.length?'今天的森林，轻轻松松':'先去认识几个新朋友吧'}</h2><p>${learned.length?'暂时没有需要复习的词。你可以休息一下，<br>也可以自己选，再听几个喜欢的词。':'探险后，老朋友会在合适的时候回来，<br>陪你再听、再想一次。'}</p>${learned.length?secondary('我想再玩一小会儿','free-review'):primary('去认识新朋友','go-home')}</div>`}<div class="panel"><h2>为什么老朋友会回来？</h2><p>隔一段时间再想一想，比一口气反复背更有助于长期记忆。这里按练习情况安排简单复习；不用为了做完任务，一直留在屏幕前。</p></div>`;
}
function parentPage() {
  const stats=getStats(state);
  const sessions=state.sessions.slice(-7).reverse();
  return `${header('陪伴，比催促更有力量','这里记录尝试，也给下一次的轻松开始留一点线索。','A LITTLE CORNER FOR PARENTS')}<div class="parent-grid"><div class="stat"><span>去过的故事</span><strong>${stats.completedLessons} <small>/ ${LESSONS.length}</small></strong><small>完成体验，不代表掌握</small></div><div class="stat"><span>见过的词</span><strong>${stats.learnedWords}</strong><small>完成过找图练习</small></div><div class="stat"><span>有过探索的日子</span><strong>${stats.practicedDays}</strong><small>累计天数，没有断签惩罚</small></div></div><section class="panel"><h2>让孩子愿意再来的一件小事</h2><p>先问“今天你最喜欢哪位朋友？”，再请孩子教你一个词。可以只听、只指，或一起说一句。比起纠正每个音，先肯定他的尝试。</p><div class="notice-list"><span>一次约 5–8 分钟</span><span>允许跳过开口</span><span>不比较，不催打卡</span></div></section><section class="panel"><h2>最近的小冒险</h2><p class="parent-note">森林游乐场已体验 ${stats.completedGames} / ${GAME_CONFIGS.length} 种玩法。游戏只记录体验，不计入词汇掌握或课程完成。</p>${sessions.length?sessions.map(s=>`<div class="session-row"><div>${esc(LESSONS.find(l=>l.id===s.lessonId)?.title || '轻松复习')}<br><small>${s.said?'孩子选择了“我试着说了”':'完成了这次探索；开口可下次尝试'}</small></div><time>${new Date(s.completedAt).toLocaleDateString('zh-CN',{month:'short',day:'numeric'})}</time></div>`).join(''):'<p>还没有完成的故事。先让孩子自己选一站，不必按顺序。</p>'}<p class="parent-note">开口记录来自孩子自选，未录音或评估发音；记录不等同于学习效果测评。</p></section><section class="panel"><h2>适合他的小设置</h2><form id="name-form"><label for="explorer-name">给小探险家起个名字</label><div class="form-row"><input id="explorer-name" name="name" maxlength="12" required value="${esc(state.settings.name)}" autocomplete="off"><button class="secondary-btn" type="submit">保存名字</button></div></form><div class="setting-row"><div><strong>英语读慢一点</strong><p>孩子随时可以重听，速度也可以按需要调整。</p></div><button class="switch" role="switch" aria-label="英语读慢一点" aria-checked="${!!state.settings.slowAudio}" data-action="toggle-audio"></button></div><div class="setting-row"><div><strong>检查英语声音</strong><p>${voiceWasTested?voiceProblem?'声音暂不可用，请检查系统英语语音。':'已尝试播放，请以实际听到声音为准。':'内置英语合成音频，首次使用请试听。'}</p></div>${secondary('试听 Hello','test-audio')}</div><p>听不到时：先检查音量和网络，再点一次试听。内置音频加载失败时会尝试设备英语朗读。平台不提供发音自动评分。</p></section><section class="panel"><h2>进度留在哪里？</h2><p>学习记录仅保存在当前设备的这个浏览器里，不会自动跨设备同步。清理浏览器数据或使用隐私模式可能丢失记录。平台不申请麦克风权限；优先播放本站内置合成音频；加载失败时使用系统或浏览器朗读，部分备用语音服务可能联网。</p><div class="footer-actions">${secondary('导出学习记录','export')}${secondary('查看学习依据与开源研究','research')}</div><p class="export-note">导出文件便于家长留档，当前版本暂不支持导入。</p><button class="text-btn danger-btn" data-action="ask-reset">清空这台设备的学习记录</button>${resetPending?`<div class="confirm-box"><p>清空后将重新开始，名字和设置也会重置。建议先导出留档。</p><div class="footer-actions">${secondary('取消','cancel-reset')}${secondary('确认清空','reset')}</div></div>`:''}</section>`;
}
function researchPage() {
  const sources=[
    ['让兴趣带路，短时而经常','围绕孩子喜欢的主题，给他选择。每次 3 个词、1 句表达、约 5–8 分钟是本平台的试用起点，不是通用最优学习量。','British Council · 家庭英语','https://learnenglishkids.britishcouncil.org/parents/helping-your-child/how-start-teaching-kids-english-home'],
    ['先理解，再愿意说','图片与情境帮助理解；跟读可以跳过。不打断纠正每个音，不用未经验证的发音分数评价孩子。','Cambridge English · 建立开口信心','https://www.cambridgeenglish.org/learning-english/parents-and-children/how-to-support-your-child/how-to-encourage-children-who-are-not-confident-speaking-in-english/'],
    ['用小任务，让表达有意义','在故事中帮助动物，再用动作或生活里的小物件试一句。没有排行榜、断签惩罚或倒计时。','British Council · 激发动力','https://learnenglishkids.britishcouncil.org/parents/helping-your-child/motivating-your-child'],
    ['隔几天，再试着想起来','平台使用简化间隔复习：答错更早再见，答对逐步延后。同一天反复完成不会反复升级。不是 FSRS，也不声称固定间隔适合所有孩子。','IES · 间隔与提取练习','https://ies.ed.gov/ncee/wwc/PracticeGuide/1'],
    ['先积累声音和意思，后续系统加入拼读','Phonics 能支持早期解码，但不等于阅读理解。本版优先建立声音、图像与意义的联系，未包含完整自然拼读课程。','EEF · Phonics 证据与边界','https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/phonics/']
  ];
  const repos=[['Anki','ankitects/anki','32,501','AGPL-3.0-or-later','主动回忆、图片与音频词卡'],['Qwerty Learner','RealKai42/qwerty-learner','23,674','GPL-3.0','即时反馈；不采用成人打字训练'],['Earthworm','cuixueshe/earthworm','11,190','AGPL-3.0','从词到句的渐进任务；最近推送 2024-11'],['LibreLingo','kantord/LibreLingo','2,629','AGPL-3.0','课程结构；已归档，不作底座'],['Lute','luteorg/lute-v3','1,603','MIT','把词放回故事；阅读界面偏成人'],['HiKid','xiaochong/hi-kid','1,172','授权表述冲突','低压力语音伙伴；仅参考思路'],['Kolibri','learningequality/kolibri','1,167','MIT','课程与本地记录；整套系统偏重'],['ts-fsrs','open-spaced-repetition/ts-fsrs','850','MIT','后续可评估；本版未集成'],['H5P Interactive Video','h5p/h5p-interactive-video','266','MIT（该组件）','有授权的视频任务；本版未集成']];
  return `${header('让每个小设计，都有来处','先把核心体验做扎实，再根据孩子的真实反应调整。','BUILT WITH CARE')}<section class="panel"><h2>学习方法 → 产品设计</h2><div class="research-list">${sources.map(([title,text,label,url])=>`<article class="research-item"><h3>${title}</h3><p>${text} <a href="${url}" target="_blank" rel="noopener noreferrer">${label} ↗</a></p></article>`).join('')}</div><p>这些来源包括教学建议和一般学习研究，并未直接验证本平台对中国二年级孩子的效果。孩子学得吃力也可能与材料难度、任务量或课堂体验有关，不能只归因于兴趣。</p></section><section class="panel"><h2>GitHub 开源参考</h2><p>Star 为 2026 年 11 月 3 日查询快照。高 Star 不等于适合儿童；本版采用原创课程与界面，参考交互机制，未复制下列项目的代码、课程或美术。</p><div class="table-scroll"><table class="repo-table"><thead><tr><th>项目</th><th>Star</th><th>许可</th><th>参考与取舍</th></tr></thead><tbody>${repos.map(([name,repo,stars,license,note])=>`<tr><td><a href="https://github.com/${repo}" target="_blank" rel="noopener noreferrer">${name} ↗</a></td><td>${stars}</td><td>${license}</td><td>${note}</td></tr>`).join('')}</tbody></table></div><p>HiKid 的 LICENSE 写 MIT，而 README 另含禁止商用表述，需先向作者澄清；H5P 各组件许可不同。未来若复用开源代码或课程，将按具体文件核查授权。</p></section><section class="panel"><h2>试用时，先看这三件小事</h2><ul><li>孩子能否自己开始，愿不愿意明天再来？</li><li>几天后听到声音，能否认出图里的朋友？</li><li>在生活里，是否愿意主动尝试一个词或一句话？</li></ul><p>如果孩子连听音找图也吃力，可以先一起听和指认；如果过于简单，再逐步提高内容难度。先不以刷题数或完成速度评价他。</p></section><button class="text-btn" data-page="parent">← 回到家长小站</button>`;
}

function startLesson(id) {
  const data=LESSONS.find(l=>l.id===id); if(!data)return;
  previousFocus=document.activeElement;
  review=null;game=null;
  lesson={data,step:0,quizIndex:0,quizResults:{},quizAttempts:0,quizCorrect:false,hint:false,tokens:[],phraseCorrect:false,feedback:'',said:false,saved:false,shuffled:shuffle(data.words)};
  document.body.style.overflow='hidden'; $('#app').inert=true; renderModal();
}
function shuffle(list) { const result=[...list]; for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result; }
function closeModal() {
  const origin=previousFocus?.dataset ? {...previousFocus.dataset} : null;
  const wasHero=!!previousFocus?.closest('.hero');
  cancelAudio(); lesson=null;review=null;game=null;exitPromptOpen=false;$('#modal-root').innerHTML='';document.body.style.overflow='';$('#app').inert=false;render();
  const launcher=wasHero ? $('.hero [data-action="start"]') : origin && [...$('#app').querySelectorAll('button,a')].find(el =>
    (origin.action && el.dataset.action===origin.action && (!origin.id || el.dataset.id===origin.id)) ||
    (!origin.action && origin.page && el.dataset.page===origin.page));
  (launcher||$('#main'))?.focus({preventScroll:true});
}
function requestCloseModal() {
  const unfinishedLesson=lesson && !lesson.saved && lesson.step>=2 && (lesson.quizIndex>0 || lesson.quizCorrect || lesson.step>2);
  const unfinishedGame=game && game.stage==='play' && (game.index>0 || game.correct || game.matched.length>0 || game.flipped.length>0);
  if(!unfinishedLesson&&!unfinishedGame){closeModal();return;}
  if(exitPromptOpen)return;
  cancelAudio();exitPromptOpen=true;
  $('.adventure').inert=true;
  $('#modal-root').insertAdjacentHTML('beforeend',`<div class="exit-overlay"><section class="exit-card" role="alertdialog" aria-modal="true" aria-labelledby="exit-title" aria-describedby="exit-description"><span class="exit-art" aria-hidden="true">🌿</span><h2 id="exit-title">要先休息一下吗？</h2><p id="exit-description">这次还没走完，再回来时会从头开始。想休息也没关系。</p><div class="adventure-footer">${primary('继续玩','resume-adventure')}${secondary('先回森林','confirm-exit')}</div></section></div>`);
  $('[data-action="resume-adventure"]')?.focus({preventScroll:true});
}
function resumeAdventure() {
  if(!exitPromptOpen)return;
  $('.exit-overlay')?.remove();exitPromptOpen=false;
  const modal=$('.adventure');if(modal)modal.inert=false;
  modal?.querySelector('.close-btn')?.focus({preventScroll:true});
}
function modalFrame(title, emoji, body, step=0, total=5) {
  return `<div class="modal-shade"><section class="adventure" role="dialog" aria-modal="true" aria-labelledby="adventure-heading"><header class="adventure-header"><div class="adventure-title"><span aria-hidden="true">${emoji}</span>${esc(title)}</div><button class="close-btn" data-action="close-modal" aria-label="退出冒险，回到森林">${icon('close')}</button></header><div class="step-track" aria-label="第${Math.min(step+1,total)}步，共${total}步">${Array.from({length:total},(_,i)=>`<span class="step-segment ${i<=step?'done':''}"></span>`).join('')}<span class="step-caption">${step>=total?'小冒险完成':`${Math.min(step+1,total)} / ${total}`}</span></div><div class="adventure-body">${body}</div></section></div>`;
}
function interactionSnapshot() {
  const active=document.activeElement;
  return {scrollTop:$('.adventure')?.scrollTop||0, action:active?.dataset?.action, id:active?.dataset?.id, index:active?.dataset?.index};
}
function restoreInteraction(snapshot) {
  const modal=$('.adventure'); if(!modal)return;
  modal.scrollTop=snapshot.scrollTop;
  if(!snapshot.action)return;
  let target=[...modal.querySelectorAll('button:not(:disabled)')].find(el=>el.dataset.action===snapshot.action && (!snapshot.id || el.dataset.id===snapshot.id) && (snapshot.index===undefined || el.dataset.index===snapshot.index));
  let reveal=false;
  if(!target && ['quiz-answer','review-answer','deliver-word','check-phrase'].includes(snapshot.action)) { target=modal.querySelector('.adventure-footer .primary-btn:not(:disabled)');reveal=!!target; }
  if(!target && snapshot.action==='add-token') target=modal.querySelector('.token-bank .token:not(:disabled)')||modal.querySelector('[data-action="check-phrase"]:not(:disabled)');
  (target||$('#adventure-heading'))?.focus({preventScroll:true});
  if(reveal)target.scrollIntoView({block:'nearest'});
}
function teachCards(words) {
  return words.map(w=>`<button class="teach-card" data-speak="${esc(w.text)}" aria-label="听${esc(w.text)}的发音"><span class="emoji" aria-hidden="true">${w.emoji}</span><strong lang="en">${esc(w.text)}</strong><small>${esc(w.zh)}</small><span class="speaker-btn" aria-hidden="true">${icon('sound')}</span></button>`).join('');
}
function renderModal({preserve=false}={}) {
  const snapshot=preserve?interactionSnapshot():null;
  cancelAudio();
  if (review) { renderReviewModal(); return; }
  if (!lesson) return;
  const l=lesson.data;
  const steps=['STORY TIME','LISTEN & DISCOVER','LISTEN & FIND','MAKE A SENTENCE','GIVE IT A TRY','A LITTLE DISCOVERY'];
  let body=`<div class="step-kicker">${steps[lesson.step]}</div>`;
  if(lesson.peek) {
    body=`<div class="step-kicker">A LITTLE HELP</div><h2 id="adventure-heading">再和朋友们打个招呼</h2><p class="step-description">点小喇叭听一听，准备好了就回到刚才的地方。</p><div class="teach-grid">${teachCards(l.words)}</div><div class="adventure-footer">${primary('回到刚才的任务','return-to-task')}</div>`;
  } else if(lesson.step===0) {
    body+=`<h2 id="adventure-heading">${esc(l.sceneTitle)}</h2><p class="step-description">${esc(l.sceneDescription)}</p><div class="story-scene ${l.id==='picnic-numbers'?'long-scene':''}" aria-hidden="true" style="background:${l.color}">${(l.storyEmojis||(l.id==='garden-colors'?['🌹','☀️','🍃']:l.words.map(w=>w.emoji))).map(e=>`<span>${e}</span>`).join('')}</div><div class="story-lines">${l.story.map(line=>`<div class="story-line">${speaker(line.en,'听这一句故事')}<div><strong lang="en">${esc(line.en)}</strong><small>${esc(line.zh)}</small></div></div>`).join('')}</div><div class="hint-pill">点小喇叭听故事。听不懂没关系，看看图片就好。</div><div class="adventure-footer">${primary('去认识它们','next-step')}</div>`;
  } else if(lesson.step===1) {
    body+=`<h2 id="adventure-heading">点一点，听它说什么</h2><p class="step-description">每个词可以多听几遍。想跟着说，也可以哦。</p><div class="teach-grid">${teachCards(l.words)}</div><div class="hint-pill">不用马上记住，待会儿我们一起找一找。</div><div class="adventure-footer">${primary('我来找一找','next-step')}</div>`;
  } else if(lesson.step===2) {
    const w=l.words[lesson.quizIndex];
    body+=`<h2 id="adventure-heading">谁在和你打招呼？</h2><p class="step-description">听听声音，再点你听到的那个朋友。可以重听。</p><div class="review-top">第 ${lesson.quizIndex+1} 个朋友 / ${l.words.length}</div><button class="listen-button" data-speak="${esc(w.text)}" aria-label="播放题目声音">${icon('sound')}听一听</button><button class="text-btn" data-action="quiz-hint">${lesson.hint?`听到的是：${esc(w.text)} · ${esc(w.zh)}`:'看文字提示'}</button><button class="text-btn" data-action="peek-words">📖 再看看词卡</button>${audioNotice()}<div class="choices">${lesson.shuffled.map(option=>`<button class="choice ${lesson.quizCorrect&&option.id===w.id?'is-correct':''}" data-action="quiz-answer" data-id="${option.id}" ${lesson.quizCorrect?'disabled':''} aria-label="${esc(option.zh)}"><span class="emoji" aria-hidden="true">${option.emoji}</span>${lesson.quizCorrect&&option.id===w.id?`<small lang="en">${esc(w.text)}</small>`:''}</button>`).join('')}</div><div class="feedback ${lesson.feedback&&!lesson.quizCorrect?'try-again':''}" role="status">${esc(lesson.feedback)}</div><div class="adventure-footer">${lesson.quizCorrect?primary(lesson.quizIndex===l.words.length-1?'一起说句话':'再找一个','next-quiz'):''}</div>`;
  } else if(lesson.step===3) {
    const tokens=l.phrase.tokens;
    body+=`<h2 id="adventure-heading">帮小伙伴，把话说完整</h2><p class="step-description">听一遍，再按顺序点小词卡。点上面的词卡可以放回去。</p><div class="phrase-picture" aria-hidden="true">${l.emoji}</div><div class="phrase-translation">${esc(l.phrase.zh)}</div><button class="listen-button" data-speak="${esc(l.phrase.en)}">${icon('sound')}听这句话</button><div class="token-slots" aria-label="已经选好的词">${lesson.tokens.length?lesson.tokens.map((index,i)=>`<button class="token" data-action="remove-token" data-index="${i}" ${lesson.phraseCorrect?'disabled':''} aria-label="放回${esc(tokens[index])}">${esc(tokens[index])}</button>`).join(''):'<span class="slot-placeholder">小词卡会来到这里</span>'}</div><div class="token-bank">${lesson.tokenOrder.map(i=>`<button class="token" data-action="add-token" data-index="${i}" ${lesson.tokens.includes(i)||lesson.phraseCorrect?'disabled':''}>${esc(tokens[i])}</button>`).join('')}</div><div class="feedback ${lesson.feedback&&!lesson.phraseCorrect?'try-again':''}" role="status">${esc(lesson.feedback)}</div><button class="text-btn" data-action="phrase-hint">${lesson.hint?esc(l.phrase.en):'给我一点提示'}</button><button class="text-btn" data-action="peek-words">📖 再看看词卡</button><div class="adventure-footer">${lesson.phraseCorrect?primary('我也来试一句','next-step'):primary('这样说，试试看','check-phrase',lesson.tokens.length!==tokens.length?'disabled':'')}${!lesson.phraseCorrect?secondary('我想先听，继续','next-step'):''}</div>`;
  } else if(lesson.step===4) {
    body+=`<h2 id="adventure-heading">轮到你了，轻轻说一句</h2><p class="step-description">可以跟着声音说，也可以只说一个喜欢的词。</p><div class="speech-example"><span class="phrase-picture" aria-hidden="true">${l.emoji}</span><strong lang="en">${esc(l.phrase.en)}</strong><small>${esc(l.phrase.zh)}</small>${speaker(l.phrase.en,'听一句，跟着试试')}</div><div class="movement"><span class="emoji" aria-hidden="true">🍃</span><div><strong>离开屏幕，也能玩一下</strong><p>${esc(l.movement.zh)}</p></div></div><div class="adventure-footer">${primary('我试着说了！','finish-lesson','data-said="true"')}${secondary('今天先听到这里','finish-lesson','data-said="false"')}</div><p class="quiet-note">不开麦，不录音。你愿意试试，就很棒。</p>`;
  } else {
    body+=`<div class="success-medal" aria-hidden="true">🌿</div><h2 id="adventure-heading">又多了一个小小发现！</h2><p class="step-description">今天，你和这 3 个词打过了招呼。<br>${lesson.said?'还试着说了英语，勇敢迈出一小步。':'先听一听也很棒。想说的时候，再试试看。'}</p><div class="summary-words">${l.words.map(w=>`<button class="summary-word" data-speak="${esc(w.text)}" aria-label="再听一次${esc(w.text)}"><span aria-hidden="true">${w.emoji}</span>${esc(w.text)} ${icon('sound')}</button>`).join('')}</div><div class="movement"><span class="emoji" aria-hidden="true">☀️</span><div><strong>把这个小发现，带到生活里</strong><p>${esc(l.movement.zh)}</p></div></div>${!storageOk?'<div class="warning storage-warning">进步暂时没有保存到浏览器，请让家长帮忙检查存储设置。</div>':''}<div class="adventure-footer">${primary('回森林，休息一下','close-modal')}</div><p class="quiet-note">过几天，老朋友还会回来和你打招呼。</p>`;
  }
  $('#modal-root').innerHTML=modalFrame(l.title,l.emoji,body,lesson.step);
  if(snapshot)restoreInteraction(snapshot);else focusModal();
}
function focusModal() { const heading=$('#adventure-heading'); if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});} $('.adventure')?.scrollTo(0,0); }
function nextStep() {
  lesson.step++; lesson.feedback=''; lesson.hint=false;
  if(lesson.step===3) { lesson.tokenOrder=shuffle(lesson.data.phrase.tokens.map((_,i)=>i)); lesson.tokens=[]; }
  renderModal();
  if(lesson.step===2)playCurrentPrompt();
}
function playCurrentPrompt() {
  const text=lesson?.step===2&&!lesson.peek?lesson.data.words[lesson.quizIndex]?.text:
    review&&!review.done?review.words[review.index]?.text:
    game?.id==='delivery'&&game.stage==='play'?game.round.order.request:null;
  if(text)speak(text,$('.adventure .listen-button'));
}
function answerQuiz(id) {
  if(!lesson || lesson.quizCorrect)return;
  const w=lesson.data.words[lesson.quizIndex]; lesson.quizAttempts++;
  if(id===w.id){lesson.quizCorrect=true;lesson.quizResults[w.id]={correct:lesson.quizAttempts===1&&!lesson.hint&&!lesson.quizPeeked,attempts:lesson.quizAttempts,recordedWrong:lesson.errorRecordedFor===w.id};lesson.feedback=`找到了！${w.text}，${w.zh}。`;}
  else {
    if(lesson.quizAttempts===1 && state.words[w.id]) { state=recordReview(state,w.id,false,new Date());lesson.errorRecordedFor=w.id;persist(); }
    lesson.feedback='再听听，慢慢找。也可以点文字提示。';
  }
  renderModal({preserve:true});
}
function finishLesson(said) {
  if(!lesson || lesson.saved)return;
  lesson.said=said;
  state=completeLesson(state,lesson.data.id,{wordResults:lesson.quizResults,said},new Date());
  lesson.saved=true;persist();lesson.step=5;renderModal();
}
function beginReview(free=false) {
  let words=free?allWords.filter(w=>state.words[w.id]):getDueWords(state);
  if(!words.length){go('review');return;}
  previousFocus=document.activeElement; lesson=null;game=null;
  review={words:shuffle(words).slice(0,6),index:0,revealed:false,hint:false,correct:false,attempts:0,recordedWrong:false,feedback:'',done:false,free};
  review.choices=reviewChoices(review.words[0]);
  document.body.style.overflow='hidden';$('#app').inert=true;renderReviewModal();
  playCurrentPrompt();
}
function reviewChoices(w) { const group=LESSONS.find(l=>l.id===w.lessonId) || LESSONS.find(l=>l.words.some(i=>i.id===w.id));return shuffle(group.words); }
function renderReviewModal({preserve=false}={}) {
  const snapshot=preserve?interactionSnapshot():null;
  cancelAudio();
  if(!review)return;
  let body;
  if(review.done) body=`<div class="success-medal" aria-hidden="true">🍃</div><h2 id="adventure-heading">又见面，真好！</h2><p class="step-description">刚刚和 ${review.words.length} 个老朋友打了招呼。<br>忘了也可以再认识一次，今天先休息一下吧。</p>${!storageOk?'<div class="warning">本次记录暂未保存，请让家长检查浏览器存储设置。</div>':''}<div class="adventure-footer">${primary('回到森林','close-modal')}</div>`;
  else {
    const w=review.words[review.index];
    body=`<div class="step-kicker">HELLO AGAIN</div><h2 id="adventure-heading">你还认得这位朋友吗？</h2><p class="step-description">先听声音，再点图。想不起来可以看提示。</p><div class="review-top">第 ${review.index+1} 个 / ${review.words.length} 个朋友</div><button class="listen-button" data-speak="${esc(w.text)}" aria-label="播放复习题目声音">${icon('sound')}听一听</button><button class="text-btn" data-action="review-hint">${review.hint?`${esc(w.text)} · ${esc(w.zh)}`:'看文字提示'}</button>${audioNotice()}<div class="choices">${review.choices.map(o=>`<button class="choice ${review.correct&&o.id===w.id?'is-correct':''}" data-action="review-answer" data-id="${o.id}" ${review.correct?'disabled':''} aria-label="${esc(o.zh)}"><span class="emoji" aria-hidden="true">${o.emoji}</span>${review.correct&&o.id===w.id?`<small>${esc(w.text)}</small>`:''}</button>`).join('')}</div><div class="feedback ${review.feedback&&!review.correct?'try-again':''}" role="status">${esc(review.feedback)}</div><div class="adventure-footer">${review.correct?primary(review.index===review.words.length-1?'今天先到这里':'再见一个朋友','next-review'):''}</div>`;
  }
  $('#modal-root').innerHTML=modalFrame('和老朋友再见一面','🌿',body,review.done?review.words.length:review.index,review.words.length);if(snapshot)restoreInteraction(snapshot);else focusModal();
}
function reviewAnswer(id) {
  if(!review||review.correct||review.done)return;
  const w=review.words[review.index]; review.attempts++;
  if(id===w.id){
    review.correct=true;review.feedback=`又认出它了！${w.text}，${w.zh}。`;
    if(!review.recordedWrong) { state=recordReview(state,w.id,review.attempts===1&&!review.hint,new Date());persist(); }
  } else {
    if(!review.recordedWrong) { state=recordReview(state,w.id,false,new Date());persist();review.recordedWrong=true; }
    review.feedback='先不着急，再听一听。';
  }
  renderReviewModal({preserve:true});
}
function wordById(id) { return allWords.find(w=>w.id===id); }
function startGame(id) {
  if(!GAME_CONFIGS.some(g=>g.id===id))return;
  previousFocus=document.activeElement;
  lesson=null;review=null;
  const animalIds=shuffle(['cat','dog','bird','duck','frog','fish']).slice(0,4);
  game={id,stage:'intro',index:0,round:id==='delivery'?createDeliveryRound(0):null,deck:id==='pairs'?createPairDeck(animalIds):[],flipped:[],matched:[],feedback:'',correct:false,hint:false,saved:false};
  document.body.style.overflow='hidden';$('#app').inert=true;renderGame();
}
function gameWords() {
  const ids=game.id==='delivery'?DELIVERY_ORDERS.map(o=>o.wordId):game.deck.map(c=>c.wordId);
  return [...new Set(ids)].map(wordById);
}
function gameIntro() {
  const delivery=game.id==='delivery';
  return `<div class="step-kicker">LET'S PLAY TOGETHER</div><h2 id="adventure-heading">${delivery?'森林点心铺，开门啦！':'给声音，找一位图片朋友'}</h2><p class="step-description">${delivery?'小狐狸会用英语点东西。听听订单，把它想要的东西送过去。':'翻一张声音卡，听它说什么；再翻一张图片卡，看看是不是一对。'}</p><div class="game-instructions"><span aria-hidden="true">${delivery?'🦊':'🔊'}</span><p>${delivery?'先点小喇叭认识货架上的东西，再接第一张订单。':'先认识这 4 位朋友。待会儿每位朋友都有一张声音卡、一张图片卡。'}<br><strong>可以重听、可以再试，没有倒计时。</strong></p></div><div class="game-vocab ${delivery?'six-words':''}">${gameWords().map(w=>`<button class="game-vocab-word" data-speak="${esc(w.text)}" aria-label="先听${esc(w.text)}的声音"><span aria-hidden="true">${w.emoji}</span><strong lang="en">${esc(w.text)}</strong><small>${esc(w.zh)}</small><span class="speaker-btn" aria-hidden="true">${icon('sound')}</span></button>`).join('')}</div><div class="adventure-footer">${primary(delivery?'准备好啦，开始送':'认识啦，去找一对','begin-game')}</div>`;
}
function renderDelivery() {
  const {order,choices}=game.round;
  const word=wordById(order.wordId);
  return `<div class="step-kicker">FOREST DELIVERY</div><h2 id="adventure-heading">小狐狸想要什么呢？</h2><p class="step-description">听听它的订单，再点货架上的东西送过去。</p><div class="delivery-scene"><div class="delivery-fox" aria-hidden="true">🦊<small>点心铺的小客人</small></div><div class="order-bubble"><button class="listen-button" data-speak="${esc(order.request)}" aria-label="听小狐狸的订单">${icon('sound')}听订单</button><button class="text-btn" data-action="delivery-hint">${game.hint?`${esc(order.request)}<br>${esc(order.zhHint)}`:'想看一点提示'}</button></div><div class="delivery-parcel ${game.correct?'arrived':''}" aria-label="${game.correct?'已经送到了':'等待送达'}"><span aria-hidden="true">${game.correct?word.emoji:'🧺'}</span><small>${game.correct?'送到啦！':'等你来送'}</small></div></div>${audioNotice()}<div class="delivery-shelf" aria-label="可以送的东西">${choices.map(id=>{const w=wordById(id);return `<div class="delivery-item"><button class="delivery-choice ${game.correct&&id===word.id?'is-correct':''}" data-action="deliver-word" data-id="${id}" aria-label="送${esc(w.zh)}" ${game.correct?'disabled':''}><span aria-hidden="true">${w.emoji}</span>${game.correct&&id===word.id?`<strong lang="en">${esc(w.text)}</strong>`:''}</button>${speaker(w.text,`听货架上${esc(w.zh)}的英语`)}</div>`;}).join('')}</div><div class="feedback ${game.feedback&&!game.correct?'try-again':''}" role="status">${esc(game.feedback)}</div><div class="adventure-footer">${game.correct?primary(game.index===DELIVERY_ORDERS.length-1?'小任务完成啦':'再接一张订单','next-delivery'):''}</div><p class="quiet-note">第 ${game.index+1} 张订单 / ${DELIVERY_ORDERS.length} · 想休息时，点右上角回森林。</p>`;
}
function renderPairs() {
  const complete=game.matched.length===game.deck.length;
  return `<div class="step-kicker">SOUNDS MEET PICTURES</div><h2 id="adventure-heading">声音和图片，谁是一对？</h2><p class="step-description">一张带小喇叭，一张藏着图片。声音卡可以点着重听。</p><div class="pairs-legend"><span>${icon('sound')} 声音卡</span><span>🌿 图片卡</span><strong>找到 ${game.matched.length/2} / 4 对</strong></div>${audioNotice()}<div class="pair-grid" aria-label="声音图片配对卡">${game.deck.map((card,i)=>{
    const w=wordById(card.wordId),matched=game.matched.includes(card.id),open=matched||game.flipped.includes(card.id),sound=card.kind==='sound';
    const label=matched?`已经配对的${w.zh}，点击再听`:open&&!sound?`翻开的${w.zh}图片`:`第${i+1}张${sound?'声音卡，点击听声音':'图片卡，点击翻开'}`;
    return `<button class="pair-card ${sound?'sound-card':'picture-card'} ${open?'revealed':''} ${matched?'matched':''}" data-action="flip-pair" data-id="${card.id}" aria-label="${esc(label)}" aria-pressed="${open}" ${game.flipped.length===2&&!game.flipped.includes(card.id)&&!matched?'disabled':''}>${sound?icon('sound'):`<span class="pair-picture" aria-hidden="true">${open?w.emoji:'🌿'}</span>`}<small>${matched?esc(w.text):sound?open?game.hint?`${esc(w.text)} · ${esc(w.zh)}`:'点我再听':'听听声音':open?'看看图片':'翻开图片'}</small>${matched?'<span class="pair-check" aria-hidden="true">✓</span>':''}</button>`;
  }).join('')}</div><div class="feedback ${game.feedback&&!game.correct?'try-again':''}" role="status">${esc(game.feedback||'慢慢翻，不用记次数。')}</div><button class="text-btn" data-action="pairs-hint">${game.hint?'翻开的声音卡会显示词语':'看看词语提示'}</button><div class="adventure-footer">${game.flipped.length===2?primary(complete?'看看我的发现':game.correct?'再找一对':'再试一对',complete?'finish-game':'reset-pair'):''}</div>`;
}
function renderGame({focusCard=null,preserve=false}={}) {
  const snapshot=(focusCard||preserve)?interactionSnapshot():null;
  cancelAudio();if(!game)return;
  const config=GAME_CONFIGS.find(g=>g.id===game.id);
  const delivery=game.id==='delivery';
  let body;
  if(game.stage==='intro')body=gameIntro();
  else if(game.stage==='done')body=`<div class="success-medal" aria-hidden="true">${delivery?'🧺':'🌼'}</div><div class="step-kicker">A LITTLE PLAY, A LITTLE DISCOVERY</div><h2 id="adventure-heading">${delivery?'森林点心，送到啦！':'声音和图片，都找到朋友啦！'}</h2><p class="step-description">${delivery?'你完成了 6 张小订单，帮小狐狸找到了想要的东西。':'你把 4 位朋友的声音和图片连在了一起。'}<br>这些声音，可以慢慢变熟悉。</p><div class="summary-words">${gameWords().map(w=>`<button class="summary-word" data-speak="${esc(w.text)}" aria-label="再听${esc(w.text)}"><span aria-hidden="true">${w.emoji}</span>${esc(w.text)} ${icon('sound')}</button>`).join('')}</div>${!storageOk?'<div class="warning">这次体验暂时没有保存，请让家长检查浏览器存储设置。</div>':''}<div class="adventure-footer">${primary('回森林，休息一下','close-modal')}${secondary('我还想再玩一小轮','replay-game')}</div><p class="quiet-note">没有分数和排名。今天愿意听、愿意试，就很棒。</p>`;
  else body=delivery?renderDelivery():renderPairs();
  const total=delivery?DELIVERY_ORDERS.length:4;
  const step=game.stage==='done'?total:game.stage==='intro'?0:delivery?game.index:Math.min(3,game.matched.length/2);
  $('#modal-root').innerHTML=modalFrame(config.title,config.emoji,body,step,total);
  if(focusCard){$('.adventure').scrollTop=snapshot.scrollTop;$(`[data-action="flip-pair"][data-id="${focusCard}"]`)?.focus({preventScroll:true});}
  else if(snapshot)restoreInteraction(snapshot);else focusModal();
}
function deliverWord(id) {
  if(!game||game.id!=='delivery'||game.stage!=='play'||game.correct)return;
  const order=game.round.order;
  if(!game.round.choices.includes(id))return;
  game.correct=id===order.wordId;
  game.feedback=game.correct?`送到啦！${wordById(id).text}，${wordById(id).zh}。小狐狸说谢谢你！`:'小狐狸想要另一样东西。再听听订单，也可以看一点提示。';
  renderGame({preserve:true});
  if(game.correct)speak(order.enFeedback,$('.delivery-parcel'));
}
function flipPair(id) {
  if(!game||game.id!=='pairs'||game.stage!=='play')return;
  const card=game.deck.find(c=>c.id===id);if(!card)return;
  if(game.matched.includes(id)||game.flipped.includes(id)){if(card.kind==='sound'||game.matched.includes(id))speak(wordById(card.wordId).text,$(`[data-action="flip-pair"][data-id="${id}"]`));return;}
  if(game.flipped.length===2)return;
  game.flipped.push(id);game.feedback=card.kind==='sound'?'听到了吗？再找一张图片卡。':'看看是哪位朋友，再找一张声音卡。';
  game.correct=false;
  if(game.flipped.length===2){
    const [first,second]=game.flipped.map(key=>game.deck.find(c=>c.id===key));
    game.correct=evaluatePair(first,second);
    if(game.correct){game.matched.push(...game.flipped);game.feedback=`找到一对！${wordById(card.wordId).text}，${wordById(card.wordId).zh}。`;}
    else if(first.kind===second.kind)game.feedback='一张声音卡，要和一张图片卡成为一对。再试试吧。';
    else {const sound=first.kind==='sound'?first:second;game.feedback=`声音说的是“${wordById(sound.wordId).zh}”。可以重听，再找找它的图片。`;}
  }
  renderGame({focusCard:id});
  if(card.kind==='sound')speak(wordById(card.wordId).text,$(`[data-action="flip-pair"][data-id="${id}"]`));
}
function finishGame() {
  if(!game||game.saved||game.stage!=='play')return;
  const complete=game.id==='delivery'?game.correct&&game.index===DELIVERY_ORDERS.length-1:game.matched.length===game.deck.length;
  if(!complete)return;
  state=completeGame(state,game.id,new Date());game.saved=true;persist();game.stage='done';renderGame();
}
function exportRecords() {
  const blob=new Blob([JSON.stringify({app:'森语探险',exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`little-english-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('学习记录已导出，请检查浏览器下载列表。');
}
document.addEventListener('click', event => {
  const button=event.target.closest('button,a');if(!button||button.disabled)return;
  if(button.dataset.page){event.preventDefault();go(button.dataset.page);return;}
  if(button.dataset.speak){speak(button.dataset.speak,button);return;}
  const action=button.dataset.action;
  if(action==='start')startLesson(button.dataset.id);
  else if(action==='filter-lessons'){lessonFilter=button.dataset.filter;render();$(`[data-action="filter-lessons"][data-filter="${lessonFilter}"]`)?.focus({preventScroll:true});}
  else if(action==='start-game')startGame(button.dataset.id);
  else if(action==='begin-game'&&game){game.stage='play';renderGame();playCurrentPrompt();}
  else if(action==='delivery-hint'&&game){game.hint=true;renderGame({preserve:true});}
  else if(action==='deliver-word')deliverWord(button.dataset.id);
  else if(action==='next-delivery'&&game?.id==='delivery'&&game.correct){if(game.index===DELIVERY_ORDERS.length-1)finishGame();else {game.index++;game.round=createDeliveryRound(game.index);game.correct=false;game.hint=false;game.feedback='';renderGame();playCurrentPrompt();}}
  else if(action==='pairs-hint'&&game?.id==='pairs'){game.hint=true;renderGame({preserve:true});}
  else if(action==='flip-pair')flipPair(button.dataset.id);
  else if(action==='reset-pair'&&game?.id==='pairs'){game.flipped=[];game.correct=false;game.feedback='';renderGame();}
  else if(action==='finish-game')finishGame();
  else if(action==='replay-game'&&game)startGame(game.id);
  else if(action==='go-home')go('home');
  else if(action==='research')go('research');
  else if(action==='close-modal')requestCloseModal();
  else if(action==='resume-adventure')resumeAdventure();
  else if(action==='confirm-exit')closeModal();
  else if(action==='next-step'&&lesson)nextStep();
  else if(action==='peek-words'&&lesson){if(lesson.step===2&&!lesson.quizCorrect)lesson.quizPeeked=true;lesson.peek=true;renderModal();}
  else if(action==='return-to-task'&&lesson){lesson.peek=false;renderModal();if(lesson.step===2&&!lesson.quizCorrect)playCurrentPrompt();}
  else if(action==='quiz-answer')answerQuiz(button.dataset.id);
  else if(action==='quiz-hint'&&lesson){lesson.hint=true;renderModal({preserve:true});}
  else if(action==='next-quiz'&&lesson?.quizCorrect){if(lesson.quizIndex<lesson.data.words.length-1){lesson.quizIndex++;lesson.quizAttempts=0;lesson.quizCorrect=false;lesson.quizPeeked=false;lesson.feedback='';lesson.hint=false;lesson.shuffled=shuffle(lesson.data.words);renderModal();playCurrentPrompt();}else nextStep();}
  else if(action==='add-token'&&lesson&&!lesson.phraseCorrect){const index=Number(button.dataset.index);if(!lesson.tokens.includes(index))lesson.tokens.push(index);lesson.feedback='';renderModal({preserve:true});}
  else if(action==='remove-token'&&lesson&&!lesson.phraseCorrect){lesson.tokens.splice(Number(button.dataset.index),1);lesson.feedback='';renderModal({preserve:true});}
  else if(action==='check-phrase'&&lesson){const tokens=lesson.data.phrase.tokens;lesson.phraseCorrect=lesson.tokens.map(i=>tokens[i]).join(' ')===tokens.join(' ');lesson.feedback=lesson.phraseCorrect?'小伙伴听懂了！一起再说一遍吧。':'差一点点。再听一遍，点词卡可以调整顺序。';renderModal({preserve:true});}
  else if(action==='phrase-hint'&&lesson){lesson.hint=true;renderModal({preserve:true});}
  else if(action==='finish-lesson')finishLesson(button.dataset.said==='true');
  else if(action==='begin-review')beginReview();
  else if(action==='free-review')beginReview(true);
  else if(action==='review-hint'&&review){review.hint=true;renderReviewModal({preserve:true});}
  else if(action==='review-answer')reviewAnswer(button.dataset.id);
  else if(action==='next-review'&&review?.correct){if(review.index===review.words.length-1)review.done=true;else {review.index++;review.hint=false;review.correct=false;review.attempts=0;review.recordedWrong=false;review.feedback='';review.choices=reviewChoices(review.words[review.index]);}renderReviewModal();if(!review.done)playCurrentPrompt();}
  else if(action==='toggle-audio'){state.settings.slowAudio=!state.settings.slowAudio;persist();render();toast(state.settings.slowAudio?'英语会读慢一点。':'已调整为自然语速。');}
  else if(action==='test-audio'){speak('Hello! I am happy to see you.',button);}
  else if(action==='export')exportRecords();
  else if(action==='ask-reset'){resetPending=true;render();$('.confirm-box')?.scrollIntoView({block:'nearest'});}
  else if(action==='cancel-reset'){resetPending=false;render();}
  else if(action==='reset'){state=createInitialState();persist();resetPending=false;render();toast(storageOk?'这台设备的记录已清空，可以重新开始。':'页面中的记录已重置，但浏览器存储清空失败，请让家长检查。');}
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='name-form')return;event.preventDefault();
  const name=new FormData(event.target).get('name').trim().slice(0,12);if(!name){toast('给小探险家起个名字吧。');return;}
  state.settings.name=name;persist();render();toast('名字保存好了。');
});
document.addEventListener('keydown',event=>{
  if(!lesson&&!review&&!game)return;
  if(event.key==='Escape'){event.preventDefault();if(exitPromptOpen)resumeAdventure();else requestCloseModal();return;}
  if(event.key==='Tab'){
    const scope=exitPromptOpen?$('.exit-overlay'):$('.adventure');
    const nodes=[...scope.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
    if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];
    if(event.shiftKey&&(document.activeElement===first||!nodes.includes(document.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||!nodes.includes(document.activeElement))){event.preventDefault();first.focus();}
  }
});
window.addEventListener('pagehide',cancelAudio);
render();
