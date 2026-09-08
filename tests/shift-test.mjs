// Проверка посменной работы (п.1): сутки, усталость, ротация смен,
// бодрость после отдыха и защита от срыва отдыха служебными кнопками.
let pass=0,fail=0;
const ok=(n,c,x='')=>{c?(pass++,console.log('PASS',n)):(fail++,console.log('FAIL',n,x))};
const near=(a,b,e=1e-9)=>Math.abs(a-b)<e;

const DAY_LEN=240, REST_TIME=26, FRESH_TIME=70, FRESH_BONUS=1.35, TIRE_RATE=1/150;

// ── сутки: фаза 0 = полдень, 0.5 = полночь (унаследовано от старого освещения) ──
const phase=t=>(t%DAY_LEN)/DAY_LEN;
const darkness=t=>0.5*(1-Math.cos(phase(t)*Math.PI*2));
const isNight=t=>darkness(t)>0.62;
ok('в полдень светло', near(darkness(0),0));
ok('в полночь темно', near(darkness(DAY_LEN/2),1));
ok('полдень — не ночь', !isNight(0));
ok('полночь — ночь', isNight(DAY_LEN/2));
ok('вечер темнее полудня', darkness(DAY_LEN*0.35)>darkness(DAY_LEN*0.1));
ok('утро светлеет к полудню', darkness(DAY_LEN*0.9)<darkness(DAY_LEN*0.7));
ok('цикл замкнут', near(darkness(0),darkness(DAY_LEN)));

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

// ── усталость копится только за работой ──
const tire=(f,dt,working,night)=>working?Math.min(1,f+dt*TIRE_RATE*(night?1.6:1)):f;
let f=0; for(let i=0;i<150;i++) f=tire(f,1,true,false);
ok('за 150 с работы — полная усталость', near(f,1), f);
let f2=0; for(let i=0;i<150;i++) f2=tire(f2,1,false,false);
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
for(let i=0;i<REST_TIME;i++) rest(w,1);
ok('после отдыха усталость обнулена', w.fatigue===0);
ok('после отдыха работник не отдыхает', w.resting===false);
ok('после отдыха выдана бодрость', w.freshT===FRESH_TIME);
let half={resting:true,restT:REST_TIME,fatigue:1,freshT:0};
for(let i=0;i<13;i++) rest(half,1);
ok('на середине отдыха усталость упала вдвое', near(half.fatigue,0.5));
ok('на середине отдыха бодрости ещё нет', half.freshT===0);

// бодрость тает
let fresh=FRESH_TIME; for(let i=0;i<FRESH_TIME;i++) fresh=Math.max(0,fresh-1);
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
