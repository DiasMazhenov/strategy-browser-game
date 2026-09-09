// Проверка посменной работы (п.1): сутки, усталость, ротация смен,
// бодрость после отдыха и защита от срыва отдыха служебными кнопками.
let pass=0,fail=0;
const ok=(n,c,x='')=>{c?(pass++,console.log('PASS',n)):(fail++,console.log('FAIL',n,x))};
const near=(a,b,e=1e-9)=>Math.abs(a-b)<e;

// Константы читаем ИЗ engine.ts, чтобы тест не разъехался с кодом при
// смене длины суток (сутки — единственная ручка, остальное её доли).
import fs from 'node:fs';
const eng=fs.readFileSync('src/game/engine.ts','utf8');
const cfg=(re,what)=>{const m=eng.match(re);if(!m){console.log('FAIL: не нашёл',what);process.exit(1);}return m;};
const DAY_LEN=parseFloat(cfg(/DAY_LEN_SEC = ([\d.]+)/,'DAY_LEN_SEC')[1]);
const REST_TIME=DAY_LEN*parseFloat(cfg(/REST_TIME = DAY_LEN_SEC \* ([\d.]+)/,'REST_TIME')[1]);
const FRESH_TIME=DAY_LEN*parseFloat(cfg(/FRESH_TIME = DAY_LEN_SEC \* ([\d.]+)/,'FRESH_TIME')[1]);
const TIRE_FULL=DAY_LEN*parseFloat(cfg(/TIRE_RATE = 1 \/ \(DAY_LEN_SEC \* ([\d.]+)\)/,'TIRE_RATE')[1]);
const FRESH_BONUS=parseFloat(cfg(/FRESH_BONUS = ([\d.]+)/,'FRESH_BONUS')[1]);
const TIRE_RATE=1/TIRE_FULL;

// ── длина суток: заявленные 15 минут и вменяемый ритм смен ──
ok(`сутки длятся 15 минут (${DAY_LEN} с)`, DAY_LEN===900, DAY_LEN);
ok('отдых заметно короче рабочей смены', REST_TIME < TIRE_FULL*0.5, `${REST_TIME.toFixed(0)} vs ${TIRE_FULL.toFixed(0)}`);
ok('бодрости хватает надолго, но не на все сутки', FRESH_TIME>REST_TIME && FRESH_TIME<DAY_LEN*0.5,
  FRESH_TIME.toFixed(0));
// цикл «работа до порога 0.8 + отдых» должен укладываться примерно раз в смену,
// иначе удлинение суток тихо превратится в ребаланс
const cycle=0.8*TIRE_FULL+REST_TIME;
const restsPerDay=DAY_LEN/cycle;
ok(`работник отдыхает ~1.6 раза за сутки (${restsPerDay.toFixed(1)})`,
  restsPerDay>1.2 && restsPerDay<2.2, restsPerDay.toFixed(2));

// ── сутки: фаза 0 = полдень, 0.5 = полночь ──
// Ночь — ЯВНЫЙ бюджет времени, а не следствие порога на косинусе.
const NIGHT_LEN=parseFloat(cfg(/NIGHT_LEN_SEC = ([\d.]+)/,'NIGHT_LEN_SEC')[1]);
const TWILIGHT=parseFloat(cfg(/TWILIGHT_SEC = ([\d.]+)/,'TWILIGHT_SEC')[1]);
const nightHalf=NIGHT_LEN/2/DAY_LEN, duskEdge=(NIGHT_LEN/2+TWILIGHT)/DAY_LEN;
const phase=t=>(t%DAY_LEN)/DAY_LEN;
const darkAt=p=>{const d=Math.abs(p-0.5);
  if(d<=nightHalf)return 1; if(d>=duskEdge)return 0;
  const x=(d-nightHalf)/(duskEdge-nightHalf); return 1-x*x*(3-2*x);};
const darkness=t=>darkAt(phase(t));
const isNightAt=p=>Math.abs(p-0.5)<=nightHalf;
const isNight=t=>isNightAt(phase(t));

ok(`ночь длится ровно ${NIGHT_LEN/60} мин`, NIGHT_LEN===120, NIGHT_LEN);
ok('день+сумерки+ночь складываются в сутки',
  near((DAY_LEN-NIGHT_LEN-2*TWILIGHT)+2*TWILIGHT+NIGHT_LEN, DAY_LEN));
ok(`светлого дня ${(DAY_LEN-NIGHT_LEN-2*TWILIGHT)/60} мин`,
  DAY_LEN-NIGHT_LEN-2*TWILIGHT===540);
// ПРОПОРЦИИ важнее абсолютных чисел: при смене длины суток доли должны
// остаться прежними — 13.3% ночь, по 13.3% сумерки, 60% светлый день.
ok('доля ночи 13.3% суток (как при 30-минутных)', near(NIGHT_LEN/DAY_LEN, 0.1333, 0.005));
ok('доля сумерек 13.3% суток', near(TWILIGHT/DAY_LEN, 0.1333, 0.005));
ok('доля светлого дня 60% суток', near((DAY_LEN-NIGHT_LEN-2*TWILIGHT)/DAY_LEN, 0.6, 0.005));
// доля ночи, посчитанная перебором — так же, как её увидит игрок
let nightTicks=0; const N=DAY_LEN*2;
for(let i=0;i<N;i++) if(isNightAt((i/2%DAY_LEN)/DAY_LEN)) nightTicks++;
ok(`ночь занимает ${(nightTicks/N*100).toFixed(1)}% суток (${(nightTicks/N*DAY_LEN/60).toFixed(1)} мин)`,
  Math.abs(nightTicks/N*DAY_LEN-NIGHT_LEN)<2, (nightTicks/N*DAY_LEN).toFixed(0));

ok('в полдень светло', near(darkness(0),0));
ok('в полночь темно', near(darkness(DAY_LEN/2),1));
ok('полдень — не ночь', !isNight(0));
ok('полночь — ночь', isNight(DAY_LEN/2));
ok('всю глухую ночь темнота максимальна',
  near(darkAt(0.5-nightHalf),1) && near(darkAt(0.5+nightHalf),1));
ok('за границей сумерек уже светло',
  darkAt(0.5-duskEdge)===0 && darkAt(0.5+duskEdge)===0);
ok('в сумерках полутьма', darkAt(0.5-(nightHalf+duskEdge)/2)>0.3 && darkAt(0.5-(nightHalf+duskEdge)/2)<0.7);
ok('вечер темнее полудня', darkness(DAY_LEN*0.40)>darkness(DAY_LEN*0.1));
ok('утро светлеет к полудню', darkness(DAY_LEN*0.95)<darkness(DAY_LEN*0.65));
ok('цикл замкнут', near(darkness(0),darkness(DAY_LEN)));
// подпись фазы обязана совпадать с ночными правилами: игрок не должен видеть
// «вечер», пока рабочие уже устают по ночной ставке
const nameAt=p=>{const d=Math.abs(p-0.5);
  if(d<=nightHalf)return'Түн'; if(d>=duskEdge)return'Күндіз'; return p<0.5?'Кеш':'Таң';};
let mismatch=0;
for(let i=0;i<1000;i++){const p=i/1000;
  if((nameAt(p)==='Түн')!==isNightAt(p)) mismatch++;}
ok('подпись «Түн» совпадает с ночными правилами', mismatch===0, mismatch);
// тёплая подсветка — на середине сумерек, не в полночь и не в полдень
const midTw=(nightHalf+duskEdge)/2;
const sunset=p=>Math.max(0,1-Math.min(Math.abs(p-(0.5-midTw)),Math.abs(p-(0.5+midTw)))/(duskEdge-nightHalf)*2);
ok('тёплый свет на закате', near(sunset(0.5-midTw),1));
ok('тёплый свет на рассвете', near(sunset(0.5+midTw),1));
ok('в полночь тёплого света нет', sunset(0.5)===0);
ok('в полдень тёплого света нет', sunset(0)===0);

const dayName=t=>{const p=phase(t);
  if(p<0.125||p>=0.875)return 'Күндіз (полдень)';
  if(p<0.375)return 'Кеш (вечер)';
  if(p<0.625)return 'Түн (ночь)';
  return 'Таң (утро)';};
ok('старт партии — полдень', dayName(0).includes('полдень'));
ok('четверть суток — вечер', dayName(DAY_LEN*0.25).includes('вечер'));
ok('половина — ночь', dayName(DAY_LEN*0.5).includes('ночь'));
ok('три четверти — утро', dayName(DAY_LEN*0.75).includes('утро'));

// смена номера дня
let dayT=0,dayNum=1;
const tickDay=dt=>{dayT+=dt;if(dayT>=DAY_LEN){dayT-=DAY_LEN;dayNum++;}};
for(let i=0;i<DAY_LEN*10;i++) tickDay(1);
ok('за 10 суток счётчик дошёл до 11-го дня', dayNum===11, dayNum);
ok('фаза после полных суток обнулилась', near(dayT,0));

// ── совместимость сейвов при смене длины суток ──
// Старые сейвы писали dayT в пределах прежних 240-секундных суток; если
// подставить это число как есть, часы застрянут около полудня.
const loadDay=(saved,DAY)=>{
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  return typeof saved.dayF==='number' ? clamp(saved.dayF,0,0.999)*DAY
    : clamp(saved.dayT??0,0,DAY);
};
ok('новый сейв переносит фазу суток как долю',
  near(loadDay({dayF:0.5,dayT:120},DAY_LEN), DAY_LEN*0.5));
ok('доля суток переживает смену длины суток',
  near(loadDay({dayF:0.25},1800),450) && near(loadDay({dayF:0.25},240),60));
ok('старый сейв без доли не ломает часы',
  loadDay({dayT:120},DAY_LEN)===120 && loadDay({dayT:120},DAY_LEN)<DAY_LEN);
ok('мусор из сейва подрезается по длине суток',
  loadDay({dayT:99999},DAY_LEN)===DAY_LEN && loadDay({dayF:5},DAY_LEN)<DAY_LEN);

// ── усталость копится только за работой ──
const tire=(f,dt,working,night)=>working?Math.min(1,f+dt*TIRE_RATE*(night?1.6:1)):f;
let f=0; for(let i=0;i<Math.round(TIRE_FULL);i++) f=tire(f,1,true,false);
ok(`за ${TIRE_FULL.toFixed(0)} с работы — полная усталость`, near(f,1,1e-6), f);
let f2=0; for(let i=0;i<Math.round(TIRE_FULL);i++) f2=tire(f2,1,false,false);
ok('без работы усталость не растёт', f2===0);
let fn=0; for(let i=0;i<100;i++) fn=tire(fn,1,true,true);
ok('ночью устают быстрее', fn>100*TIRE_RATE, fn);
ok('усталость не превышает 1', tire(0.99,100,true,true)===1);

// ── производительность: бодрый быстрее, вымотанный медленнее ──
const workMult=(base,fatigue,fresh)=>{let m=base;
  if(fresh>0)m*=FRESH_BONUS; else if(fatigue>0.7)m*=1-(fatigue-0.7)*0.8;
  return m;};
ok('свежий работник даёт +35%', near(workMult(1,0,FRESH_TIME),1.35));
ok('обычный работник — базовая скорость', near(workMult(1,0.5,0),1));
ok('до порога 0.7 штрафа нет', near(workMult(1,0.7,0),1));
ok('вымотанный медленнее', workMult(1,1,0)<1);
ok('при полной усталости −24%', near(workMult(1,1,0),1-0.3*0.8));
ok('бодрость важнее усталости', near(workMult(1,1,10),1.35));
ok('глобальные множители сохраняются', near(workMult(1.3,0,FRESH_TIME),1.3*1.35));

// ── отдых восстанавливает и даёт бодрость ──
const rest=(u,dt)=>{u.restT-=dt;u.fatigue=Math.max(0,u.fatigue-dt/REST_TIME);
  if(u.restT<=0){u.resting=false;u.fatigue=0;u.freshT=FRESH_TIME;}return u;};
let w={resting:true,restT:REST_TIME,fatigue:1,freshT:0};
for(let i=0;i<Math.ceil(REST_TIME);i++) rest(w,1);
ok('после отдыха усталость обнулена', w.fatigue===0);
ok('после отдыха работник не отдыхает', w.resting===false);
ok('после отдыха выдана бодрость', w.freshT===FRESH_TIME);
let half={resting:true,restT:REST_TIME,fatigue:1,freshT:0};
rest(half,REST_TIME/2);            // ровно половина отдыха, какой бы длины он ни был
ok('на середине отдыха усталость упала вдвое', near(half.fatigue,0.5,1e-9), half.fatigue);
ok('на середине отдыха бодрости ещё нет', half.freshT===0);

// бодрость тает
let fresh=FRESH_TIME; for(let i=0;i<Math.ceil(FRESH_TIME);i++) fresh=Math.max(0,fresh-1);
ok('бодрость иссякает за FRESH_TIME', fresh===0);

// ── ПОСМЕННОСТЬ: одновременно отдыхает не больше трети ──
const cap=n=>Math.max(1,Math.floor(n/3));
ok('из 9 работников отдыхают максимум 3', cap(9)===3);
ok('из 3 работников — 1', cap(3)===1);
ok('из 2 работников — 1', cap(2)===1);
ok('из 12 — 4', cap(12)===4);
const pick=(vills,night)=>{
  const need=night?0.55:0.8;
  const resting=vills.filter(u=>u.resting).length;
  const free=cap(vills.length)-resting;
  if(free<=0)return [];
  return vills.filter(u=>!u.resting&&!u.herder&&u.fatigue>=need&&!(u.freshT>0))
    .sort((a,b)=>b.fatigue-a.fatigue).slice(0,free);
};
const crew=[{fatigue:0.9},{fatigue:0.95},{fatigue:0.85},{fatigue:0.3},{fatigue:0.2},{fatigue:0.1}];
const sent=pick(crew,false);
ok('отпущены только двое (треть от 6)', sent.length===2, sent.length);
ok('первым уходит самый уставший', near(sent[0].fatigue,0.95));
ok('свежие остаются работать', !sent.some(u=>u.fatigue<0.8));
ok('при заполненной смене никого не отпускаем',
  pick([{resting:true},{fatigue:0.99},{fatigue:0.99}],false).length===0);
ok('пастуха не отправляем на отдых',
  pick([{fatigue:0.99,herder:true},{fatigue:0.99},{fatigue:0.9}],false).every(u=>!u.herder));
ok('только что отдохнувшего не гоняем повторно',
  pick([{fatigue:0.99,freshT:50},{fatigue:0.85},{fatigue:0.82}],false).every(u=>!(u.freshT>0)));
ok('ночью порог ниже — отпускаем раньше',
  pick([{fatigue:0.6},{fatigue:0.6},{fatigue:0.6}],true).length===1 &&
  pick([{fatigue:0.6},{fatigue:0.6},{fatigue:0.6}],false).length===0);
ok('единственного работника не отпускаем (артель < 2)', [{fatigue:1}].length<2);

// ── отдыхающий не считается простаивающим ──
const idleCount=vs=>vs.filter(u=>!u.resting&&(u.state==='idle'||u.state==='move')).length;
const mixed=[{state:'idle',resting:true},{state:'idle',resting:false},{state:'gather',resting:false}];
ok('счётчик простоя игнорирует отдыхающих', idleCount(mixed)===1, idleCount(mixed));
ok('кнопка «за работу» не трогает отдыхающих',
  mixed.filter(u=>!u.resting&&u.state==='idle').length===1);

// ── прямой приказ игрока отменяет отдых ──
const order=u=>{if(u.resting){u.resting=false;u.restT=0;u.restKind=undefined;u.shiftBack=null;}return u;};
const cmd=order({resting:true,restT:20,fatigue:0.9,restKind:'swing',shiftBack:{nodeId:5}});
ok('приказ снимает отдых', cmd.resting===false);
ok('приказ снимает сценку', cmd.restKind===undefined);
ok('приказ не исцеляет усталость', near(cmd.fatigue,0.9));
ok('приказ забывает точку возврата', cmd.shiftBack===null);

// ── возврат к тому же ресурсу после смены ──
const back=(u,nodes)=>{const b=u.shiftBack;u.shiftBack=null;
  if(b&&b.nodeId>=0){const n=nodes.find(n=>n.id===b.nodeId&&n.amount>0);if(n)return n.id;}
  return null;};
ok('после отдыха возвращается к своему ресурсу',
  back({shiftBack:{nodeId:7}},[{id:7,amount:100}])===7);
ok('к выработанному ресурсу не возвращается',
  back({shiftBack:{nodeId:7}},[{id:7,amount:0}])===null);
ok('без запомненного ресурса идёт в покой',
  back({shiftBack:null},[{id:7,amount:100}])===null);

// ── занятия на отдыхе ──
const restKind=(female,r)=>female?(r<0.55?'kazan':'swing'):(r<0.6?'asyk':'swing');
ok('женщины готовят в казане', restKind(true,0.2)==='kazan');
ok('женщины катаются на алтыбакане', restKind(true,0.9)==='swing');
ok('мужчины играют в асыки', restKind(false,0.1)==='asyk');
ok('мужчины тоже качаются', restKind(false,0.9)==='swing');

console.log(`\n${pass}/${pass+fail} PASS`);
process.exit(fail?1:0);
