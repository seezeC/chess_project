const ICON={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',decoy:'♔'};
const ICON_WHITE={k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙',decoy:'♔'};
const NAME={k:'킹',q:'퀸',r:'룩',b:'비숍',n:'나이트',p:'폰',decoy:'킹 분신'};
const BASE={k:4,q:7,r:5,b:3,n:3,p:1,decoy:0};
const BUY_PRICE={p:2,n:5,b:5,r:8,q:12,k:10};
const ABILITY_COST={p:2,n:4,b:4,r:5,q:7,k:5};
const ABILITY_OPTIONS={
 p:[['charge','돌격대장','앞이 비어 있으면 시작 위치와 관계없이 두 칸 전진할 수 있습니다.'],['claw','집게발','폰 바로 앞의 적도 잡을 수 있습니다.']],
 b:[['billiard','당구','가장자리 칸에 도착하면 같은 차례에 한 번 더 움직이거나 잡을 수 있습니다.'],['stealth','은신비숍','엔진의 수읽기에서 기물의 종류와 성급을 숨깁니다.']],
 n:[['backstep','뒤로 가는 나이트','뒤쪽으로 이동해 적을 잡으면 같은 차례에 한 번 더 움직입니다.'],['unicorn','유니콘','한 번 움직이는 대신 나이트와 자기 킹의 위치를 바꿀 수 있습니다.']],
 r:[['fortify','요새화','룩이 모서리에 있으면 직선으로 보이는 첫 적을 제자리에서 공격합니다.'],['cannon','포 행마법','룩의 일반 이동에 더해, 기물 하나를 넘어서 그 뒤의 빈칸으로 이동하거나 적을 잡습니다.']],
 q:[['assassin','암살자','킹만 이 퀸을 잡을 수 있고, 이 퀸은 적 킹만 공격할 수 있습니다.'],['abduct','납치','퀸이 움직이지 않고 사정거리 안의 기물을 사정거리 내 빈칸으로 옮깁니다.']],
 k:[['zombie','좀비','킹의 목숨이 총 3개가 됩니다.'],['schrodinger','슈뢰딩거의 킹','킹 주변에 분신을 소환합니다. 적이 분신을 잡으면 킹은 자기 차례 2번 동안 움직이지 못합니다.']]
};
const START_BACK=['r','n','b','q','k','b','n','r'];
const PHASES=['오프닝','미들','라스트','엔드'];
const STAGE_MOVES=[10,17,25,Infinity];
const STANDARD_COUNTS={p:8,n:2,b:2,r:2,q:1,k:1};
const $=id=>document.getElementById(id);
const copyPiece=p=>({...p,home:{...p.home},origin:{...(p.origin||p.home)}});
let roomSocket=null;
let roomConnectAction='';
let S;

function icon(kind,color='w'){return color==='w'?(ICON_WHITE[kind]||'◆'):(ICON[kind]||'◆')}
function unit(id,color,kind,x,y,extra={}){return{id,color,kind,x,y,home:{x,y},origin:{x,y},star:1,hp:1,maxHp:1,hasMoved:false,alive:true,inField:true,isCore:false,isRoyal:false,ability:null,immobilized:0,...extra}}
function normalArmy(color){let a=[];for(let x=0;x<8;x++)a.push(unit(`${color}P${x}`,color,'p',x,color==='w'?1:6,{isCore:color==='w'}));for(let x=0;x<8;x++){let k=START_BACK[x];a.push(unit(`${color}B${x}`,color,k,x,color==='w'?0:7,{isCore:color==='w',isRoyal:k==='k'}))}return a}
function initialState(){return{round:1,level:1,gold:5,mode:'battle',gameMode:'single',difficulty:'normal',playerColor:'w',roomCode:'',roomOwnFormation:'standard',roomPeerConnected:false,roomPeerReady:false,roomSelfReady:false,side:'w',board:null,white:normalArmy('w'),black:normalArmy('b'),formation:'standard',formationCategory:'etc',selected:null,legal:[],stageMoves:0,roundEarned:0,preMovesRemaining:0,prepMoveUndo:[],winStreak:0,lossStreak:0,eval:0,lastQuality:'복기 대기',lastDelta:'—',log:[],offers:[],offerSeed:7,purchased:{p:0,n:0,b:0,r:0,q:0,k:0},lastMove:null,pendingExtra:null,abilityMode:null,pendingAbilityUnits:[],halfmoveClock:0,positionCounts:{},finish:null,statusText:''}}
function newGame(difficulty='normal'){if(roomSocket){roomSocket.close();roomSocket=null}S=initialState();S.gameMode='single';S.difficulty=difficulty;S.playerColor=Math.random()<.5?'w':'b';S.board=makeBoard();freshOffers();recordPosition();$('modalHost').innerHTML='';document.body.classList.remove('start-screen');render()}
S=initialState();
function inside(x,y){return x>=0&&x<8&&y>=0&&y<8}
function fileIndex(c){return c.charCodeAt(0)-97}
function squareIndex(s){return{x:fileIndex(s[0]),y:Number(s[1])-1}}
function deploymentRows(){return Math.min(6,2+Math.floor((S.level-1)/2))}
function coreHomeSquares(piece){if(piece.kind==='p')return Array.from({length:8},(_,x)=>({x,y:1}));if(piece.kind==='r')return[{x:0,y:0},{x:7,y:0}];if(piece.kind==='n')return[{x:1,y:0},{x:6,y:0}];if(piece.kind==='b')return[{x:2,y:0},{x:5,y:0}];if(piece.kind==='q'||piece.kind==='k')return[piece.origin||piece.home];return[]}
function isCoreHomeSquare(piece,x,y){return coreHomeSquares(piece).some(square=>square.x===x&&square.y===y)}
function hasFieldKing(){return!!S.board&&S.board.flat().filter(p=>p&&p.color==='w'&&p.kind==='k'&&p.isRoyal).length===1}
function fieldCap(){return 41+(S.level-1)*10}
function cost(p){return(BASE[p.kind]||0)*p.star+(p.ability?ABILITY_COST[p.kind]||0:0)}
function fieldCost(){return S.white.filter(p=>p.alive&&p.inField).reduce((sum,p)=>sum+cost(p),0)}
function currentStageLimit(){return STAGE_MOVES[S.round-1]??Infinity}
function unitValue(kind){return BASE[kind]||0}
function difficultyElo(level){return({easy:500,normal:1200,hard:2000}[level]||1200)}
function freshOffers(){let d=Math.max(0,Math.min(5,S.level-1)),weights={p:48-d,n:16+d*.15,b:16+d*.15,r:10+d*.3,q:5+d*.35,k:5+d*.05},kinds=Object.keys(weights),total=Object.values(weights).reduce((sum,value)=>sum+value,0);let seed=S.offerSeed=(S.offerSeed*9301+49297)%233280;let rnd=()=>{seed=(seed*9301+49297)%233280;return seed/233280};S.offers=[];for(let i=0;i<4;i++){let roll=rnd()*total,kind=kinds.find(k=>(roll-=weights[k])<0)||'p';S.offers.push({kind,price:BUY_PRICE[kind]})}}

function cloneBoard(b){let n=b.map(row=>row.map(p=>p?copyPiece(p):null));n.ep=b.ep?{...b.ep}:null;return n}
function findSlot(b,color){const rows=color==='w'?[0,1,2,3,4,5]:[7,6,5,4,3,2];for(let r=0;r<deploymentRows();r++)for(let x=0;x<8;x++){let y=rows[r];if(!b[y][x])return[x,y]}return null}
function makeBoard(){let b=Array.from({length:8},()=>Array(8).fill(null));for(const p of [...S.white,...S.black])if(p.alive&&p.inField){let{x,y}=p.home;if(!inside(x,y)||b[y][x]){let slot=findSlot(b,p.color);if(!slot)continue;[x,y]=slot;p.home={x,y}}p.x=x;p.y=y;b[y][x]=copyPiece(p)}b.ep=null;return b}

const OPENINGS=[
 {id:'standard',name:'표준 체스',desc:'기본 시작 배치',level:1,counts:STANDARD_COUNTS,line:[]},
 {id:'scandi',name:'스칸디나비안 디펜스',desc:'1.e4 d5 2.exd5 Qxd5',level:2,counts:STANDARD_COUNTS,line:['e2e4','d7d5','e4d5','d8d5']},
 {id:'qgd',name:'퀸스 갬빗 디클라인',desc:'1.d4 d5 2.c4 e6',level:2,counts:STANDARD_COUNTS,line:['d2d4','d7d5','c2c4','e7e6']},
 {id:'london',name:'런던 시스템',desc:'1.d4 d5 2.Bf4 Nf6',level:2,counts:STANDARD_COUNTS,line:['d2d4','d7d5','c1f4','g8f6']},
 {id:'sicilian',name:'시실리안 디펜스',desc:'1.e4 c5 2.Nf3 d6',level:2,counts:STANDARD_COUNTS,line:['e2e4','c7c5','g1f3','d7d6']},
 {id:'italian',name:'이탈리안 게임',desc:'1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5',level:3,counts:STANDARD_COUNTS,line:['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5']},
 {id:'ruy3',name:'루이 로페즈',desc:'1.e4 e5 2.Nf3 Nc6 3.Bb5 a6',level:3,counts:STANDARD_COUNTS,line:['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6']},
 {id:'kings3',name:'킹스 인디언 디펜스',desc:'1.d4 Nf6 2.c4 g6 3.Nc3 Bg7',level:3,counts:STANDARD_COUNTS,line:['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7']},
 {id:'french',name:'프렌치 디펜스 · 위나워',desc:'1.e4 e6 2.d4 d5 3.Nc3 Bb4',level:3,counts:STANDARD_COUNTS,line:['e2e4','e7e6','d2d4','d7d5','b1c3','f8b4']},
 {id:'nimzo',name:'님조 인디언 디펜스',desc:'1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.e3 d5',level:4,counts:STANDARD_COUNTS,line:['d2d4','g8f6','c2c4','e7e6','b1c3','f8b4','e2e3','d7d5']},
 {id:'grunfeld',name:'그룬펠드 디펜스',desc:'1.d4 Nf6 2.c4 g6 3.Nc3 d5 4.Nf3 Bg7',level:4,counts:STANDARD_COUNTS,line:['d2d4','g8f6','c2c4','g7g6','b1c3','d7d5','g1f3','f8g7']},
 {id:'catalan',name:'카탈란 오프닝',desc:'1.d4 Nf6 2.c4 e6 3.g3 d5 4.Bg2 Be7',level:4,counts:STANDARD_COUNTS,line:['d2d4','g8f6','c2c4','e7e6','g2g3','d7d5','f1g2','f8e7']},
 {id:'openSicilian',name:'시실리안 · 오픈 베리에이션',desc:'1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6',level:4,counts:STANDARD_COUNTS,line:['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6']},
 {id:'najdorf',name:'시실리안 · 나이도프',desc:'1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6',level:5,counts:STANDARD_COUNTS,line:['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','a7a6']},
 {id:'ruyClosed',name:'루이 로페즈 · 클로즈드',desc:'1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7',level:5,counts:STANDARD_COUNTS,line:['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5a4','g8f6','e1g1','f8e7']},
 {id:'kings5',name:'킹스 인디언 · 클래시컬',desc:'1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Nf3 O-O',level:5,counts:STANDARD_COUNTS,line:['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','g1f3','e8g8']},
 {id:'london5',name:'런던 시스템 · 메인 라인',desc:'1.d4 d5 2.Bf4 Nf6 3.e3 c5 4.c3 Nc6 5.Nd2 e6',level:5,counts:STANDARD_COUNTS,line:['d2d4','d7d5','c1f4','g8f6','e2e3','c7c5','c2c3','b8c6','b1d2','e7e6']},
 {id:'qga6',name:'퀸스 갬빗 · 수락 메인 라인',desc:'1.d4 d5 2.c4 dxc4 3.Nf3 Nf6 4.e3 e6 5.Bxc4 c5 6.O-O a6',level:6,counts:STANDARD_COUNTS,line:['d2d4','d7d5','c2c4','d5c4','g1f3','g8f6','e2e3','e7e6','f1c4','c7c5','e1g1','a7a6']},
 {id:'horde',name:'폰 호드',desc:'폰 10기 · 폰 10회 영입 필요',level:4,counts:{p:10},purchases:{p:10},special:'horde'},
 {id:'mongolian',name:'몽골리안 갬빗',desc:'폰 8 + 나이트 3 · 나이트 6회 영입',level:4,counts:{p:8,n:3,k:1},purchases:{n:6},special:'mongolian'},
 {id:'queens',name:'퀸 럼블',desc:'퀸 4 + 폰 8 + 킹 · 퀸 7회 영입',level:5,counts:{p:8,q:4,k:1},purchases:{q:7},special:'queens'}
];

function piecesForCounts(counts){let alive=S.white.filter(p=>p.alive),picked=[];for(const[k,n]of Object.entries(counts)){let group=alive.filter(p=>p.kind===k);if(group.length<n)return null;picked.push(...group.slice(0,n))}return picked}
function formationCost(id){let f=OPENINGS.find(x=>x.id===id),picked=f&&piecesForCounts(f.counts);return picked?picked.reduce((s,p)=>s+cost(p),0):Infinity}
function canForm(f){if(S.level<f.level)return{ok:false,why:`레벨 ${f.level} 필요`};for(const[k,n]of Object.entries(f.purchases||{})){let got=S.purchased[k]||0;if(got<n)return{ok:false,why:`${NAME[k]} ${n}회 영입 필요`}}let picked=piecesForCounts(f.counts);if(!picked)return{ok:false,why:'생존 기물 부족'};let c=picked.reduce((s,p)=>s+cost(p),0);if(c>fieldCap())return{ok:false,why:'필드 코스트 초과'};return{ok:true,cost:c}}
function regularHomes(chosen){let groups={p:chosen.filter(p=>p.kind==='p')};groups.back={};for(const k of ['r','n','b','q','k'])groups.back[k]=chosen.filter(p=>p.kind===k);for(const [i,p]of groups.p.entries())p.home={x:i%8,y:1+Math.floor(i/8)};const files={r:[0,7],n:[1,6],b:[2,5],q:[3],k:[4]};for(const k of Object.keys(files))groups.back[k].forEach((p,i)=>p.home={x:files[k][i]??i,y:0})}
function specialHomes(f,chosen){if(f.special==='horde'){chosen.filter(p=>p.kind==='p').forEach((p,i)=>p.home={x:i%8,y:Math.floor(i/8)})}else if(f.special==='mongolian'){let ps=chosen.filter(p=>p.kind==='p'),ns=chosen.filter(p=>p.kind==='n'),king=chosen.find(p=>p.kind==='k');ns.forEach((p,i)=>p.home={x:1+i,y:0});ps.forEach((p,i)=>p.home={x:i,y:1});if(king)king.home={x:4,y:0}}else if(f.special==='queens'){let qs=chosen.filter(p=>p.kind==='q'),ps=chosen.filter(p=>p.kind==='p'),king=chosen.find(p=>p.kind==='k');qs.forEach((p,i)=>p.home={x:i,y:0});ps.forEach((p,i)=>p.home={x:i,y:1});if(king)king.home={x:4,y:0}}}
function resetBlackHomes(){for(const p of S.black.filter(p=>p.alive)){let i=Number(p.id.slice(2));p.home={x:i,y:p.id.startsWith('bP')?6:7};p.hasMoved=false;p.inField=true;p.immobilized=0}}
function openingBoard(chosen){let b=Array.from({length:8},()=>Array(8).fill(null));for(const p of chosen)if(p.inField)b[p.home.y][p.home.x]=copyPiece(p);for(const p of S.black.filter(p=>p.alive&&p.inField))b[p.home.y][p.home.x]=copyPiece(p);b.ep=null;return b}
function applyOpening(f,chosen){let b=openingBoard(chosen);for(const[index,uci]of(f.line||[]).entries()){let from=squareIndex(uci.slice(0,2)),to=squareIndex(uci.slice(2,4)),side=index%2===0?'w':'b',legal=legalMoves(b,side),m=legal.find(x=>x.fx===from.x&&x.fy===from.y&&x.tx===to.x&&x.ty===to.y);if(!m)return null;let victim=b[m.ty][m.tx];if(m.ep)victim=b[m.fy][m.tx];if(victim){let original=S.white.concat(S.black).find(p=>p.id===victim.id);if(original)original.inField=false}b=applyMove(b,m)}return b}
function standardOpeningBoard(){let b=Array.from({length:8},()=>Array(8).fill(null));for(const p of [...normalArmy('w'),...normalArmy('b')])b[p.home.y][p.home.x]=copyPiece(p);b.ep=null;return b}
function replayFormationBoard(id,color){const f=OPENINGS.find(x=>x.id===id);if(!f||f.special)return null;let b=standardOpeningBoard();for(const[index,uci]of(f.line||[]).entries()){let from=squareIndex(uci.slice(0,2)),to=squareIndex(uci.slice(2,4));if(color==='b'){from.y=7-from.y;to.y=7-to.y}let side=color==='w'?(index%2===0?'w':'b'):(index%2===0?'b':'w'),legal=legalMoves(b,side),m=legal.find(x=>x.fx===from.x&&x.fy===from.y&&x.tx===to.x&&x.ty===to.y);if(!m)return null;b=applyMove(b,m)}return b}
function rosterFromFormation(board,color){let roster=normalArmy(color),byId=new Map(roster.map(p=>[p.id,p]));for(const p of board.flat())if(p&&p.color===color){let original=byId.get(p.id);if(original){Object.assign(original,copyPiece(p));original.home={x:p.x,y:p.y};original.alive=true;original.inField=true}}for(const p of roster)if(!board.flat().some(q=>q?.id===p.id)){p.alive=false;p.inField=false;p.hp=0}return roster}
function setupRoomPosition(whiteId,blackId){let whiteBoard=replayFormationBoard(whiteId,'w'),blackBoard=replayFormationBoard(blackId,'b');if(!whiteBoard||!blackBoard)return false;let board=Array.from({length:8},()=>Array(8).fill(null));for(const source of [whiteBoard,blackBoard])for(const p of source.flat())if(p&&((source===whiteBoard&&p.color==='w')||(source===blackBoard&&p.color==='b'))){if(board[p.y][p.x])return false;board[p.y][p.x]=copyPiece(p)}S.white=rosterFromFormation(whiteBoard,'w');S.black=rosterFromFormation(blackBoard,'b');for(const p of board.flat())if(p){p.home={x:p.x,y:p.y};let roster=(p.color==='w'?S.white:S.black).find(q=>q.id===p.id);if(roster)roster.home={x:p.x,y:p.y}}board.ep=null;S.board=board;S.roomWhiteFormation=whiteId;S.roomBlackFormation=blackId;S.formation='room';S.mode='roomBattle';S.side='w';S.stageMoves=0;S.log=[];S.finish=null;S.halfmoveClock=0;S.positionCounts={};recordPosition();S.statusText=`진형 공개 · White ${OPENINGS.find(f=>f.id===whiteId)?.name} / Black ${OPENINGS.find(f=>f.id===blackId)?.name}`;return true}
function formationArmy(id,quiet=false){const f=OPENINGS.find(x=>x.id===id);if(!f)return false;let chk=canForm(f);if(!chk.ok){if(!quiet)toast(chk.why);return false}let oldWhite=S.white.map(copyPiece),oldBlack=S.black.map(copyPiece),oldBoard=S.board?cloneBoard(S.board):null,oldFormation=S.formation,oldSide=S.side;let chosen=piecesForCounts(f.counts);for(const p of S.white.filter(p=>p.alive)){p.inField=chosen.includes(p);p.hasMoved=false;p.immobilized=0}resetBlackHomes();if(f.special)specialHomes(f,chosen);else regularHomes(chosen);let b=openingBoard(chosen);if(f.line?.length){b=applyOpening(f,chosen);if(!b){S.white=oldWhite;S.black=oldBlack;S.board=oldBoard;S.formation=oldFormation;S.side=oldSide;if(!quiet)toast('이 오프닝에 필요한 생존 기물이 없습니다.');return false}}
 for(let y=0;y<8;y++)for(let x=0;x<8;x++){let p=b[y][x];if(p){let original=S.white.concat(S.black).find(z=>z.id===p.id);if(original){original.home={x,y};original.hasMoved=p.hasMoved;original.hp=p.hp;original.maxHp=p.maxHp}}}
 S.formation=id;S.selected=null;S.legal=[];S.abilityMode=null;S.pendingExtra=null;S.board=b;S.side='w';S.halfmoveClock=0;S.positionCounts={};recordPosition();if(!quiet)toast(`${f.name} · ${(f.line||[]).length/2}수 포지션`);render();return true}

function findKing(b,color){for(let y=0;y<8;y++)for(let x=0;x<8;x++){let p=b[y][x];if(p&&p.color===color&&p.kind==='k'&&p.isRoyal)return{x,y,p}}return null}
const KNIGHT_DIRS=[[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
const RAY_DIRS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
function attacked(b,x,y,by){for(const[dx,dy]of KNIGHT_DIRS){let p=b[y-dy]?.[x-dx];if(p&&p.color===by&&(p.kind==='n'||p.ability==='unicorn'))return true}for(const[dx,dy]of RAY_DIRS){let orth=dx===0||dy===0,blockers=0;for(let d=1;d<8;d++){let xx=x+dx*d,yy=y+dy*d;if(!inside(xx,yy))break;let p=b[yy][xx];if(!p)continue;if(p.color===by){if(blockers===0&&(p.kind==='q'||(orth&&p.kind==='r')||(!orth&&p.kind==='b')))return true;if(p.kind==='k'&&d===1)return true;if(orth&&blockers===1&&p.kind==='r'&&p.ability==='cannon')return true}blockers++;if(blockers>=2)break}}let pawnY=y+(by==='w'?-1:1),frontY=y-(by==='w'?1:-1);for(const dx of [-1,1]){let p=b[pawnY]?.[x+dx];if(p&&p.color===by&&p.kind==='p')return true}let claw=b[frontY]?.[x];if(claw&&claw.color===by&&claw.kind==='p'&&claw.ability==='claw')return true;return false}
function inCheck(b,color){let k=findKing(b,color);return k?attacked(b,k.x,k.y,color==='w'?'b':'w'):false}
function queenRaySquares(b,x,y,emptyOnly=false){let out=[];for(const[dx,dy]of RAY_DIRS)for(let d=1;d<8;d++){let tx=x+dx*d,ty=y+dy*d;if(!inside(tx,ty))break;let p=b[ty][tx];if(p){if(!emptyOnly)out.push({x:tx,y:ty,p});break}out.push({x:tx,y:ty,p:null})}return out}
function pseudo(b,x,y){let p=b[y][x];if(!p)return[];let out=[];const add=(tx,ty,extra={})=>{if(!inside(tx,ty))return;let target=b[ty][tx];if(target&&target.color===p.color)return;if(target?.isRoyal)return;if(target&&p.ability==='assassin')return;if(target?.ability==='assassin'&&!p.isRoyal)return;if(k==='r'&&p.ability==='fortify'&&(x===0||x===7)&&(y===0||y===7)&&target)extra={...extra,fortify:true};out.push({fx:x,fy:y,tx,ty,...extra})};let k=p.kind;
 if(k==='p'){let dir=p.color==='w'?1:-1,one=y+dir,charge=p.ability==='charge';if(inside(x,one)){if(!b[one][x]){add(x,one);let two=y+2*dir,start=p.color==='w'?1:6;if(inside(x,two)&&!b[two][x]&&(charge||y===start))add(x,two,{double:true})}else if(p.ability==='claw'&&b[one][x].color!==p.color&&!b[one][x].isRoyal)add(x,one,{claw:true})}for(const dx of [-1,1]){let tx=x+dx,ty=y+dir;if(!inside(tx,ty))continue;let target=b[ty][tx];if(target&&target.color!==p.color&&!target.isRoyal)add(tx,ty);else if(b.ep&&b.ep.x===tx&&b.ep.y===y)out.push({fx:x,fy:y,tx,ty,ep:true})}return out}
 if(k==='n'){for(const[dx,dy]of KNIGHT_DIRS)add(x+dx,y+dy);if(p.ability==='unicorn'){let king=findKing(b,p.color);if(king&&king.p.immobilized===0)out.push({fx:x,fy:y,tx:king.x,ty:king.y,kingSwap:true})}return out}
 if(k==='k'){if(p.isRoyal&&p.immobilized>0)return[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if(dx||dy)add(x+dx,y+dy);if(p.isRoyal&&!p.hasMoved&&!inCheck(b,p.color)){let enemy=p.color==='w'?'b':'w';for(const side of ['k','q']){let rookX=side==='k'?7:0,r=b[y][rookX],path=side==='k'?[5,6]:[3,2,1];if(r?.kind==='r'&&r.color===p.color&&!r.hasMoved&&path.every(xx=>!b[y][xx])&&path.slice(0,2).every(xx=>!attacked(b,xx,y,enemy)))out.push({fx:x,fy:y,tx:side==='k'?6:2,ty:y,castle:side})}}return out}
 if(['r','b','q'].includes(k)){let dirs=k==='r'?RAY_DIRS.slice(0,4):k==='b'?RAY_DIRS.slice(4):RAY_DIRS;for(const[dx,dy]of dirs){let orth=dx===0||dy===0;for(let d=1;d<8;d++){let tx=x+dx*d,ty=y+dy*d;if(!inside(tx,ty))break;let target=b[ty][tx];if(target){if(target.color!==p.color&&!target.isRoyal)add(tx,ty);break}add(tx,ty)}}
  if(k==='r'&&p.ability==='cannon'){for(const[dx,dy]of RAY_DIRS.slice(0,4)){let screened=false;for(let d=1;d<8;d++){let tx=x+dx*d,ty=y+dy*d;if(!inside(tx,ty))break;let target=b[ty][tx];if(!target){if(screened)add(tx,ty,{cannon:true});continue}if(!screened){screened=true;continue}if(target.color!==p.color&&!target.isRoyal)add(tx,ty,{cannon:true});break}}}
  return out}return out}
function applyMove(board,m){let b=cloneBoard(board),p=b[m.fy][m.fx],target=b[m.ty][m.tx];b.ep=null;if(m.kingSwap){let king=target;if(!king?.isRoyal)return b;b[m.fy][m.fx]=king;b[m.ty][m.tx]=p;king.x=m.fx;king.y=m.fy;king.hasMoved=true;p.x=m.tx;p.y=m.ty;p.hasMoved=true;return b}
 if(m.fortify){if(target?.hp>1){target.hp--;p.hasMoved=true;return b}b[m.ty][m.tx]=null;p.hasMoved=true;return b}
 let captured=target;if(m.ep)captured=b[m.fy][m.tx];if(captured&&captured.hp>1){captured.hp--;p.hasMoved=true;b[m.fy][m.fx]=p;return b}if(m.ep)b[m.fy][m.tx]=null;
 if(captured?.kind==='decoy'){let royal=findKing(b,captured.color);if(royal)royal.p.immobilized=2}
 b[m.fy][m.fx]=null;if(m.castle){let rookX=m.castle==='k'?7:0,toX=m.castle==='k'?5:3,rook=b[m.fy][rookX];if(rook){b[m.fy][rookX]=null;rook.x=toX;rook.y=m.fy;rook.hasMoved=true;b[m.fy][toX]=rook}}
 p.x=m.tx;p.y=m.ty;p.hasMoved=true;if(p.kind==='p'&&(m.ty===0||m.ty===7)){p.kind='q';p.ability=null;p.maxHp=p.star===1?1:2;p.hp=Math.min(p.hp,p.maxHp)}b[m.ty][m.tx]=p;if(m.double)b.ep={x:m.tx,y:m.ty};return b}
function legalMoves(b,color,onlyId=null){let out=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++){let p=b[y][x];if(!p||p.color!==color||(onlyId&&p.id!==onlyId))continue;for(const m of pseudo(b,x,y)){let n=applyMove(b,m);if(!inCheck(n,color))out.push(m)}}return out}

function staticEval(b){let score=0;for(let y=0;y<8;y++)for(let x=0;x<8;x++){let p=b[y][x];if(!p)continue;let v=p.kind==='decoy'?2.5:unitValue(p.kind)+(p.star-1)*.7+(p.ability?.35:0);if(p.hp<p.maxHp)v*=.6;let center=(3.5-Math.abs(3.5-x))+(3.5-Math.abs(3.5-y));v+=p.kind==='p'?center*.035:center*.015;if(p.kind==='k'&&p.isRoyal&&y<2)v+=.15;if(p.kind==='k'&&p.isRoyal&&p.immobilized>0)v-=p.immobilized*.8;score+=p.color==='w'?v:-v}if(findKing(b,'b')&&inCheck(b,'b'))score+=.3;if(findKing(b,'w')&&inCheck(b,'w'))score-=.3;return score}
function observerBoard(board,observer){let b=cloneBoard(board);for(let y=0;y<8;y++)for(let x=0;x<8;x++){let p=b[y][x];if(p&&p.color!==observer&&p.ability==='stealth')b[y][x]={...p,kind:'unknown',star:1,hp:1,maxHp:1,ability:null,isRoyal:false}}return b}
function scoreAfterWhiteMove(m){let after=applyMove(S.board,m),score=staticEval(after),replies=legalMoves(after,'b');if(replies.length){let worst=Infinity;for(const r of replies)worst=Math.min(worst,staticEval(applyMove(after,r)));score=worst}return score}
function qualityFor(regret){if(regret<=.05)return['최선 수',2,'good'];if(regret<=.35)return['탁월 수',1,'good'];if(regret<=.9)return['좋은 수',1,'good'];if(regret<=1.7)return['준수한 수',0,'neutral'];if(regret<=3)return['부정확',0,'bad'];if(regret<=5)return['실수',-1,'bad'];return['블런더',-2,'bad']}
function classifyMove(m,moves){let actual=scoreAfterWhiteMove(m),best=Math.max(...moves.map(scoreAfterWhiteMove)),regret=Math.max(0,best-actual);return{actual,best,regret,judgement:qualityFor(regret)}}
function coord(x,y){return String.fromCharCode(97+x)+(y+1)}
function formatMove(m,before){let p=before[m.fy][m.fx],target=before[m.ty][m.tx];if(m.castle)return m.castle==='k'?'O-O':'O-O-O';if(m.kingSwap)return'♘↔♔';if(m.fortify)return`${icon(p.kind,p.color)} 요새화×${coord(m.tx,m.ty)}`;return`${icon(p.kind,p.color)} ${coord(m.fx,m.fy)}${target?'×':'–'}${coord(m.tx,m.ty)}${m.cannon?' · 포':''}${m.ep?' e.p.':''}`}
function addLog(move,color,quality=null,bad=false,score=null,regret=null){S.log.push({round:S.round,turn:S.stageMoves+1,move,color,quality,bad,score,regret});if(S.log.length>700)S.log.shift()}
function writeBack(board){for(const p of S.white.concat(S.black)){if(!p.alive)continue;let found=null;for(let y=0;y<8&&!found;y++)for(let x=0;x<8;x++)if(board[y][x]?.id===p.id){found=board[y][x];break}if(found){Object.assign(p,copyPiece(found));p.inField=true}else if(p.inField){p.alive=false;p.hp=0}}}
function moveLabel(m,before){let label=formatMove(m,before);if(m.double)label+='';return label}
function applyLiveMove(m){let before=S.board,p=before[m.fy][m.fx],target=before[m.ty][m.tx],didCapture=!m.kingSwap&&(!!target||!!m.ep),movingKind=p.kind,label=moveLabel(m,before),next=applyMove(before,m);if(didCapture&&target?.hp>1)label+=' · 방어막 타격';S.halfmoveClock=(movingKind==='p'||didCapture)?0:S.halfmoveClock+1;S.board=next;writeBack(next);let after=next.flat().find(q=>q?.id===p.id);S.lastMove={fx:m.fx,fy:m.fy,tx:after?.x??m.tx,ty:after?.y??m.ty};return{label,pieceId:p.id,to:{x:after?.x??m.tx,y:after?.y??m.ty},captured:didCapture}}
function chooseBotMove(moves){if(S.difficulty==='easy')return moves[Math.floor(Math.random()*moves.length)];let scored=moves.map(m=>{let after=applyMove(S.board,m),view=observerBoard(after,'b'),score=-staticEval(view);if(S.difficulty==='hard'){let reply=legalMoves(after,'w');if(reply.length){let bestForWhite=-Infinity;for(const r of reply)bestForWhite=Math.max(bestForWhite,staticEval(observerBoard(applyMove(after,r),'b')));score=-bestForWhite}}return{m,score:score+Math.random()*(S.difficulty==='hard'?.02:.12)}}).sort((a,b)=>b.score-a.score);return scored[0]?.m}
function refreshEval(){if(!S.board)return;S.eval=staticEval(S.board);let view=S.playerColor==='b'?-S.eval:S.eval;if($('evalScore')){$('evalScore').textContent=(view>=0?'+':'')+view.toFixed(1);$('evalLabel').textContent=Math.abs(view)<1?'균형 잡힌 포지션':view>0?'나 우세':'상대 우세';$('evalFill').style.height=Math.max(8,Math.min(92,50+view*5))+'%'}}
function unitsOnBoard(color){return S.board.flat().filter(p=>p&&p.kind!=='decoy'&&p.color===color)}
function finishCheckmate(color){let playerMated=color==='w';S.side=color;S.mode='finished';S.finish={outcome:playerMated?'loss':'win',reason:playerMated?'체크메이트로 패배':'상대가 체크메이트 당했습니다.'};S.selected=null;S.legal=[];S.pendingExtra=null;S.abilityMode=null;showFinal()}
function isCheckmate(board,color){return inCheck(board,color)&&legalMoves(board,color).length===0}
function finishByRules(){let white=unitsOnBoard('w'),black=unitsOnBoard('b');if(!white.length||!black.length){endRound(white.length?'win':'loss',white.length?'상대 군대를 전멸시켰습니다.':'기물을 모두 잃었습니다.');return true}let legal=legalMoves(S.board,S.side);if(!legal.length){if(inCheck(S.board,S.side))finishCheckmate(S.side);else endRound('draw','스테일메이트');return true}return false}
function atEdge(x,y){return x===0||x===7||y===0||y===7}
function decrementImmobilized(color){let king=findKing(S.board,color);if(king&&king.p.immobilized>0){king.p.immobilized--;let own=S.white.concat(S.black).find(p=>p.id===king.p.id);if(own)own.immobilized=king.p.immobilized}}
function recordPosition(){if(!S.board)return;let state=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++){let p=S.board[y][x];if(p)state.push(`${x}${y}${p.color}${p.kind}${p.star||1}${p.hp||1}${p.ability||''}${p.hasMoved?'m':''}`)}state.push(S.side,S.board.ep?`${S.board.ep.x}${S.board.ep.y}`:'-');let key=state.join('|');S.positionCounts[key]=(S.positionCounts[key]||0)+1;return S.positionCounts[key]}
function insufficientMaterial(){let w=unitsOnBoard('w'),b=unitsOnBoard('b');if(!findKing(S.board,'w')||!findKing(S.board,'b'))return false;let rest=[...w,...b].filter(p=>p.kind!=='k');return rest.length===0||(rest.length===1&&['b','n'].includes(rest[0].kind))}
function completePlayerTurn(){S.pendingExtra=null;S.abilityMode=null;S.selected=null;S.legal=[];S.stageMoves++;decrementImmobilized('w');S.side='b';if(finishByRules()){render();return}render();setTimeout(botTurn,220)}
function moveSelected(m){if(S.mode!=='battle'||S.side!=='w')return;let usedExtra=!!S.pendingExtra,all=legalMoves(S.board,'w',S.pendingExtra?.id||null),analysis=classifyMove(m,all),[quality,pay,kind]=analysis.judgement,before=S.board,target=before[m.ty][m.tx],epTarget=m.ep?before[m.fy][m.tx]:null,captured=m.kingSwap?null:(target||epTarget),result=applyLiveMove(m),mover=S.white.find(p=>p.id===result.pieceId);S.roundEarned+=pay;S.lastQuality=quality;S.lastDelta=`대안 대비 −${analysis.regret.toFixed(1)}`;S.winStreak=kind==='good'?S.winStreak+1:0;S.lossStreak=kind==='bad'?S.lossStreak+1:0;addLog(result.label,'w',quality,kind==='bad',staticEval(S.board),analysis.regret);S.statusText='이번 수 보상 '+pay+'G';
 if(isCheckmate(S.board,'b')){completePlayerTurn();return}let extraType=null,pos=S.board.flat().find(p=>p?.id===result.pieceId);if(!usedExtra&&mover&&pos){if(mover.kind==='b'&&mover.ability==='billiard'&&atEdge(pos.x,pos.y))extraType='billiard';else if(mover.kind==='n'&&mover.ability==='backstep'&&captured&&captured.color==='b'&&m.ty<m.fy)extraType='backstep'}if(extraType){let more=legalMoves(S.board,'w',mover.id);if(more.length){S.pendingExtra={id:mover.id,type:extraType};S.selected={x:pos.x,y:pos.y};S.legal=more;S.statusText=extraType==='billiard'?'벽에 닿았습니다 · 한 번 더 움직이세요':'후방 포획 · 한 번 더 움직이세요';render();return}}completePlayerTurn()}
function maybeDrawOrLimit(){if(S.halfmoveClock>=100){endRound('draw','50수 규칙 무승부');return true}if(insufficientMaterial()){endRound('draw','기물 부족 무승부');return true}let repetitions=recordPosition();if(repetitions>=3){endRound('draw','동일 포지션 3회 반복 무승부');return true}let limit=currentStageLimit();if(Number.isFinite(limit)&&S.stageMoves>=limit){endRound('draw',`${limit}수 종료 · 생존 기물을 다음 단계로 넘깁니다.`);return true}return false}
function botTurn(){if(S.mode!=='battle'||S.side!=='b')return;let moves=legalMoves(S.board,'b');if(!moves.length){finishByRules();render();return}let m=chooseBotMove(moves),result=applyLiveMove(m),mover=S.black.find(p=>p.id===result.pieceId);addLog(result.label,'b','엔진 수',false,staticEval(S.board),null);if(isCheckmate(S.board,'w')){decrementImmobilized('b');finishCheckmate('w');render();return}let pos=S.board.flat().find(p=>p?.id===result.pieceId);if(mover?.kind==='b'&&mover.ability==='billiard'&&pos&&atEdge(pos.x,pos.y)){let extra=legalMoves(S.board,'b',mover.id);if(extra.length){let again=chooseBotMove(extra),bonus=applyLiveMove(again);addLog(bonus.label,'b','벽 반사',false,staticEval(S.board),null)}}decrementImmobilized('b');S.side='w';if(finishByRules()){render();return}refreshEval();if(maybeDrawOrLimit()){render();return}S.statusText='';render()}
function endRound(outcome,reason){if(S.mode!=='battle')return;S.mode=S.round>=4?'finished':'prep';S.finish={outcome,reason};if(outcome==='win')S.roundEarned+=S.round===1?3:4;S.roundEarned+=Math.floor(S.winStreak/2);let base=5,interest=Math.min(5,Math.floor(S.gold/10)),total=Math.max(0,base+S.roundEarned)+interest;S.gold+=total;S.settlement={base,earned:S.roundEarned,interest,total};S.statusText=`라운드 보상 +${total}G · 저축 이자 +${interest}G`;S.selected=null;S.legal=[];S.pendingExtra=null;S.abilityMode=null;S.side='w';if(S.mode==='prep'){for(const p of S.white.concat(S.black))if(p.alive){p.hasMoved=false;p.immobilized=0}S.board=makeBoard();S.preMovesRemaining=S.level;S.prepMoveUndo=[];freshOffers()}else{showFinal()}render()}

function autoFuse(triggerId){let trigger=S.white.find(p=>p.id===triggerId&&p.alive&&!p.inField),changed=false,madeThreeStar=false;if(!trigger)return false;while(trigger.star<3){let need=trigger.star===1?3:2,group=S.white.filter(p=>p.alive&&!p.inField&&p.kind===trigger.kind&&p.star===trigger.star);if(group.length<need)break;let parts=[trigger,...group.filter(p=>p.id!==trigger.id).slice(0,need-1)],at={...parts[0].home},royal=parts.some(p=>p.isRoyal),nextStar=trigger.star+1,maxHp=nextStar===3?2:nextStar;S.white=S.white.filter(p=>!parts.includes(p));trigger=unit('wF'+Math.random().toString(36).slice(2,8),'w',parts[0].kind,at.x,at.y,{star:nextStar,hp:maxHp,maxHp,isRoyal:royal,isCore:false,inField:false});S.white.push(trigger);if(nextStar===3){S.pendingAbilityUnits.push(trigger.id);madeThreeStar=true}changed=true}if(changed)toast(madeThreeStar?'★3 완성 · 특수 능력을 선택하세요.':'기물 성급이 자동 합성되었습니다.');return changed}
function chooseAbility(unitId,abilityId){let p=S.white.find(x=>x.id===unitId&&x.alive);if(!p||p.star!==3)return;p.ability=abilityId;if(p.kind==='k'&&abilityId==='zombie'){p.maxHp=3;p.hp=3}else{p.maxHp=2;p.hp=Math.min(p.hp,2)}S.pendingAbilityUnits=S.pendingAbilityUnits.filter(id=>id!==unitId);toast(`${NAME[p.kind]} · ${ABILITY_OPTIONS[p.kind].find(a=>a[0]===abilityId)?.[1]} 능력`);render()}
function buyOffer(i){if(S.mode!=='prep')return;let offer=S.offers[i];if(!offer)return;if(S.gold<offer.price){toast('골드가 부족합니다.');return}S.gold-=offer.price;let royalMissing=!S.white.some(p=>p.alive&&p.kind==='k'&&p.isRoyal),p=unit('w'+offer.kind.toUpperCase()+Math.random().toString(36).slice(2,7),'w',offer.kind,0,0,{inField:false,isRoyal:offer.kind==='k'&&royalMissing});S.white.push(p);S.purchased[offer.kind]=(S.purchased[offer.kind]||0)+1;S.offers[i]=null;autoFuse(p.id);render()}
function reroll(){if(S.mode!=='prep'||S.gold<2)return;S.gold-=2;S.offerSeed+=19;freshOffers();toast('상점 제안을 다시 굴렸습니다.');render()}
function buyLevel(){if(S.mode!=='prep')return;let price=({1:10,2:15,3:22,4:30,5:40}[S.level]||50);if(S.level>=6){toast('최대 레벨입니다.');return}if(S.gold<price){toast('골드가 부족합니다.');return}S.gold-=price;S.level++;S.preMovesRemaining=Math.max(0,S.level-S.prepMoveUndo.length);toast(`레벨 ${S.level} · 필드 한도 ${fieldCap()} · 정비 선행 수 ${S.preMovesRemaining}회`);render()}
function saleValue(p){let normal=Math.floor(cost(p)/2),penalty=p.star>1?(['q','k'].includes(p.kind)?2:1):0;return Math.max(1,normal-penalty)}
function benchSelected(){if(S.mode!=='prep'||!S.selected)return;let p=S.white.find(x=>x.id===S.selected);if(!p?.alive||!p.inField)return;let onBoard=S.board.flat().find(q=>q?.id===p.id);if(onBoard)S.board[onBoard.y][onBoard.x]=null;p.inField=false;S.selected=null;autoFuse(p.id);render()}
function sellSelected(){if(S.mode!=='prep'||!S.selected)return;let p=S.white.find(x=>x.id===S.selected);if(!p?.alive)return;let value=saleValue(p);S.gold+=value;S.pendingAbilityUnits=S.pendingAbilityUnits.filter(id=>id!==p.id);let onBoard=S.board.flat().find(q=>q?.id===p.id);if(onBoard)S.board[onBoard.y][onBoard.x]=null;S.white=S.white.filter(x=>x.id!==p.id);S.selected=null;toast(`${NAME[p.kind]} 판매 · +${value}G`);render()}
function deploySelected(x,y){let p=S.white.find(z=>z.id===S.selected);if(!p||!p.alive||p.inField)return false;if(p.isCore?!isCoreHomeSquare(p,x,y):y>=deploymentRows()){toast(p.isCore?'기본 기물은 원래 종류의 시작 칸에만 배치할 수 있습니다.':'이 레벨에서 열리지 않은 배치 행입니다.');return false}if(fieldCost()+cost(p)>fieldCap()){toast('필드 코스트 한도 초과');return false}if(S.board[y][x])return false;p.inField=true;p.x=x;p.y=y;p.home={x,y};S.board[y][x]=p;S.formation='custom';return true}
function prepMovesFrom(unitId){return legalMoves(S.board,'w',unitId).filter(m=>!S.board[m.ty][m.tx]&&!m.ep&&!m.kingSwap&&!m.fortify)}
function prepRestrictedMovesFrom(unitId){let piece=S.board.flat().find(p=>p?.id===unitId);if(!piece?.isCore||['q','k'].includes(piece.kind))return[];let moves=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++){if((x===piece.x&&y===piece.y)||!isCoreHomeSquare(piece,x,y))continue;let target=S.board[y][x];if(!target||target.isCore&&target.kind===piece.kind&&isCoreHomeSquare(target,piece.x,piece.y))moves.push({fx:piece.x,fy:piece.y,tx:x,ty:y,prepHome:true})}return moves}
function playPrepMove(move){if(S.mode!=='prep'||S.preMovesRemaining<=0||S.side!=='w')return;let from=S.board[move.fy][move.fx];if(!from||from.color!=='w'||S.board[move.ty][move.tx]||move.ep||move.kingSwap||move.fortify)return;let changed=[from];if(move.castle){let rook=S.board[move.fy][move.castle==='k'?7:0];if(rook)changed.push(rook)}S.prepMoveUndo.push({pieces:changed.map(p=>copyPiece(p)),ep:S.board.ep?{...S.board.ep}:null,lastMove:S.lastMove?{...S.lastMove}:null,halfmoveClock:S.halfmoveClock,logLength:S.log.length});let result=applyLiveMove(move);S.preMovesRemaining--;S.side=S.preMovesRemaining>0?'w':'b';S.selected=null;S.legal=[];S.statusText=S.preMovesRemaining?`정비 선행 수 저장 · ${S.preMovesRemaining}수 남음 · 마지막 수 되돌리기 가능`:'정비 선행 수를 모두 사용했습니다. 기본 기물 이동 규칙이 적용됩니다.';S.log.push({round:S.round,turn:S.prepMoveUndo.length,move:result.label,color:'w',quality:'정비 선행 수',bad:false,score:staticEval(S.board),regret:null});render()}
function undoPrepMove(){if(S.mode!=='prep'||!S.prepMoveUndo.length)return;let previous=S.prepMoveUndo[S.prepMoveUndo.length-1],ids=new Set(previous.pieces.map(p=>p.id)),next=cloneBoard(S.board);for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(next[y][x]&&ids.has(next[y][x].id))next[y][x]=null;let restorable=previous.pieces.filter(saved=>S.white.some(p=>p.id===saved.id&&p.alive&&p.inField));if(restorable.some(saved=>next[saved.y]?.[saved.x])){toast('되돌릴 칸이 다른 기물로 막혀 있습니다. 먼저 빈칸을 확보하세요.');return}for(const saved of restorable){let current=S.white.find(p=>p.id===saved.id);Object.assign(current,copyPiece(saved));next[saved.y][saved.x]=current}next.ep=previous.ep?{...previous.ep}:null;S.board=next;S.prepMoveUndo.pop();S.side='w';S.lastMove=previous.lastMove;S.halfmoveClock=previous.halfmoveClock;S.log.length=previous.logLength;S.preMovesRemaining=Math.max(0,S.level-S.prepMoveUndo.length);S.selected=null;S.legal=[];S.statusText=`정비 선행 수를 되돌렸습니다. ${S.preMovesRemaining}수 남음`;render()}

function clickSquare(x,y){if(S.mode==='prep'){if(S.selected){let p=S.white.find(z=>z.id===S.selected);if(p&&!p.inField){if(S.board[y][x]){toast('기물을 놓을 빈 칸을 선택하세요.');return}deploySelected(x,y);if(p.inField){S.selected=null;render()}return}else if(p?.inField){if(p.x===x&&p.y===y){S.selected=null;render();return}if(!p.isCore){if(S.board[y][x]?.color==='w'){S.selected=S.board[y][x].id;render()}toast('배치한 추가 기물은 대기석으로 옮긴 뒤 다시 배치하세요.');return}if(p.kind==='q'||p.kind==='k'){toast(`${NAME[p.kind]}은(는) 정비 중 위치를 바꿀 수 없습니다.`);return}if(!isCoreHomeSquare(p,x,y)){toast('기본 기물은 같은 종류의 원래 시작 칸끼리만 이동할 수 있습니다.');return}if(S.board[y][x]){let other=S.board[y][x];if(!other.isCore||other.kind!==p.kind||!isCoreHomeSquare(other,p.home.x,p.home.y)){if(other.color==='w')S.selected=other.id;render();toast('같은 종류의 기본 기물끼리만 자리를 바꿀 수 있습니다.');return}let old={...other.home};other.home={...p.home};p.home=old;S.formation='custom';S.board=makeBoard();S.selected=other.id;render();return}p.home={x,y};S.formation='custom';S.board=makeBoard();render();return}}let q=S.board[y][x];S.selected=q?.color==='w'?q.id:null;render();return}
 if(S.mode!=='battle'||S.side!=='w')return;if(S.abilityMode){handleAbilitySquare(x,y);return}let p=S.board[y][x];if(S.selected){let moves=S.legal.filter(m=>m.tx===x&&m.ty===y);if(moves.length){moveSelected(moves[0]);return}}if(S.pendingExtra){if(p?.id===S.pendingExtra.id){S.selected={x,y};S.legal=legalMoves(S.board,'w',S.pendingExtra.id)}else toast('추가 이동을 먼저 마쳐야 합니다.');render();return}if(p?.color==='w'){S.selected={x,y};S.legal=legalMoves(S.board,'w').filter(m=>m.fx===x&&m.fy===y)}else{S.selected=null;S.legal=[]}render()}
const regularPrepClickSquare=clickSquare;
clickSquare=function(x,y){if(S.mode!=='prep'){regularPrepClickSquare(x,y);return}let target=S.board[y][x],selected=typeof S.selected==='string'?S.white.find(p=>p.id===S.selected):null;if(selected&&!selected.inField){if(target){toast('기물을 놓을 빈 칸을 선택하세요.');return}if(deploySelected(x,y)){S.selected=null;S.legal=[];render()}return}if(selected?.inField){let piece=S.board.flat().find(p=>p?.id===selected.id);if(!piece){S.selected=null;S.legal=[];render();return}if(S.preMovesRemaining>0&&S.side==='w'){let move=S.legal.find(m=>m.tx===x&&m.ty===y);if(move){playPrepMove(move);return}if(target?.color==='w'){S.selected=target.id;S.legal=prepMovesFrom(target.id);render();return}toast('정비 선행 수는 비어 있는 칸으로만 둘 수 있습니다.');return}if(piece.x===x&&piece.y===y){S.selected=null;S.legal=[];render();return}if(!piece.isCore){if(target?.color==='w'){S.selected=target.id;S.legal=[];render()}toast('추가 배치 기물은 정비 중 이동할 수 없습니다.');return}if(piece.kind==='q'||piece.kind==='k'){toast(`${NAME[piece.kind]}은(는) 정비 중 위치를 바꿀 수 없습니다.`);return}if(!isCoreHomeSquare(piece,x,y)){toast('기본 기물은 같은 종류의 원래 시작 칸끼리만 이동할 수 있습니다.');return}let sx=piece.x,sy=piece.y;if(target){if(!target.isCore||target.kind!==piece.kind||!isCoreHomeSquare(target,sx,sy)){if(target.color==='w'){S.selected=target.id;S.legal=[];render()}toast('같은 종류의 기본 기물끼리만 자리를 바꿀 수 있습니다.');return}target.x=sx;target.y=sy;target.home={x:sx,y:sy};S.board[sy][sx]=target;piece.x=x;piece.y=y;piece.home={x,y};S.board[y][x]=piece}else{S.board[sy][sx]=null;piece.x=x;piece.y=y;piece.home={x,y};S.board[y][x]=piece}writeBack(S.board);S.formation='custom';S.selected=null;S.legal=[];render();return}if(target?.color==='w'){S.selected=target.id;S.legal=S.preMovesRemaining>0&&S.side==='w'?prepMovesFrom(target.id):[]}else{S.selected=null;S.legal=[]}render()};
function beginAbility(){if(S.mode!=='battle'||S.side!=='w'||!S.selected||typeof S.selected!=='object')return;let p=S.board[S.selected.y][S.selected.x];if(!p)return;if(p.kind==='k'&&p.ability==='schrodinger'){if(inCheck(S.board,'w')){toast('체크 중에는 분신을 소환할 수 없습니다.');return}for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(S.board[y][x]?.kind==='decoy'&&S.board[y][x].color==='w')S.board[y][x]=null;S.abilityMode={type:'summon',kingId:p.id};S.legal=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){let x=p.x+dx,y=p.y+dy;if((dx||dy)&&inside(x,y)&&!S.board[y][x])S.legal.push({tx:x,ty:y,ability:'summon'})}S.statusText='킹 주변의 빈칸을 눌러 분신을 소환하세요.'}else if(p.kind==='q'&&p.ability==='abduct'){S.abilityMode={type:'abductPick',queenId:p.id};S.legal=queenRaySquares(S.board,p.x,p.y,false).filter(s=>s.p&&s.p.kind!=='k'&&s.p.kind!=='decoy').map(s=>({tx:s.x,ty:s.y,ability:'abductPick'}));S.statusText='퀸 사정거리 안의 기물을 선택하세요.'}render()}
function cancelAbility(){S.abilityMode=null;S.legal=[];S.statusText='특수 능력을 취소했습니다.';render()}
function handleAbilitySquare(x,y){let mode=S.abilityMode;if(mode.type==='summon'){if(!S.legal.some(m=>m.tx===x&&m.ty===y))return;let king=S.board.flat().find(p=>p?.id===mode.kingId);if(!king)return;S.board[y][x]=unit('decoy'+Math.random().toString(36).slice(2,6),'w','decoy',x,y,{hp:1,maxHp:1});S.board[y][x].home={x,y};S.halfmoveClock=0;addLog(`♔ 분신 소환 ${coord(x,y)}`,'w','특수 능력',false,staticEval(S.board),0);completePlayerTurn();return}
 if(mode.type==='abductPick'){let piece=S.board[y][x],allowed=S.legal.some(m=>m.tx===x&&m.ty===y);if(!allowed||!piece)return;let queen=S.board.flat().find(p=>p?.id===mode.queenId);if(!queen)return;S.abilityMode={type:'abductPlace',queenId:queen.id,targetId:piece.id};let openBoard=cloneBoard(S.board);openBoard[piece.y][piece.x]=null;S.legal=queenRaySquares(openBoard,queen.x,queen.y,true).map(s=>({tx:s.x,ty:s.y,ability:'abductPlace'}));S.statusText='선택한 기물을 옮길 빈칸을 누르세요. 퀸은 움직이지 않습니다.';render();return}
 if(mode.type==='abductPlace'){if(!S.legal.some(m=>m.tx===x&&m.ty===y))return;let target=S.board.flat().find(p=>p?.id===mode.targetId),queen=S.board.flat().find(p=>p?.id===mode.queenId);if(!target||!queen||target.isRoyal)return;let test=cloneBoard(S.board);test[target.y][target.x]=null;test[y][x]=copyPiece(target);test[y][x].x=x;test[y][x].y=y;if(inCheck(test,'w')){toast('이동 후 킹이 공격받아 이 수는 둘 수 없습니다.');return}let from=coord(target.x,target.y);S.board[target.y][target.x]=null;S.board[y][x]=target;target.x=x;target.y=y;writeBack(S.board);S.lastMove={fx:queen.x,fy:queen.y,tx:x,ty:y};S.halfmoveClock=0;addLog(`♛ 납치 ${from}→${coord(x,y)}`,'w','특수 능력',false,staticEval(S.board),0);completePlayerTurn()}}
function renderAbilityAction(){let btn=$('abilityActionBtn');if(S.mode!=='battle'||S.side!=='w'||!S.selected||typeof S.selected!=='object'){btn.style.display='none';return}let p=S.board[S.selected.y]?.[S.selected.x];if(S.abilityMode){btn.style.display='inline-block';btn.textContent='능력 취소';btn.onclick=cancelAbility;return}if((p?.kind==='k'&&p.ability==='schrodinger')||(p?.kind==='q'&&p.ability==='abduct')){btn.style.display='inline-block';btn.textContent=p.kind==='k'?'분신 소환':'납치 능력';btn.onclick=beginAbility}else btn.style.display='none'}

function openNextRound(){if(S.mode!=='prep')return;if(S.pendingAbilityUnits.length){toast('★3 특수 능력을 먼저 선택하세요.');return}if(!hasFieldKing()){S.statusText='라운드를 시작하려면 내 킹 1개를 필드에 배치해야 합니다.';toast('킹을 필드에 배치해야 라운드를 시작할 수 있습니다.');render();return}if(fieldCost()>fieldCap()){toast('필드 코스트를 한도 안으로 맞춰주세요.');return}if(S.round>=4)return;let movedAhead=S.prepMoveUndo.length>0;S.round++;S.stageMoves=0;S.roundEarned=0;S.finish=null;S.mode='battle';S.side=movedAhead?'b':'w';S.preMovesRemaining=0;S.prepMoveUndo=[];S.pendingExtra=null;S.abilityMode=null;S.selected=null;S.legal=[];S.statusText=movedAhead?'정비 중 미리 둔 포지션에서 시작합니다.':'';S.halfmoveClock=0;S.positionCounts={};recordPosition();refreshEval();if(finishByRules()){render();return}render();toast(`${PHASES[S.round-1]} 시작`);if(S.side==='b')setTimeout(botTurn,220)}
function applyRoundOpening(){if(S.formation!=='custom')formationArmy(S.formation,true)}
function materialTotal(pieces){return pieces.filter(p=>p.alive&&p.inField).reduce((s,p)=>s+unitValue(p.kind),0)}
function showFinal(){S.mode='finished';let white=materialTotal(S.white),black=materialTotal(S.black),result=S.finish?.outcome==='win'?'승리':S.finish?.outcome==='loss'?'패배':white>black?'승리':white<black?'패배':'무승부';refreshEval();$('modalHost').innerHTML=`<div class="overlay"><div class="modal"><div class="eyebrow">RIFT RUN COMPLETE</div><h2>게임 종료</h2><p>게임이 끝났습니다. 이제 수별 평가와 엔진 평가를 복기할 수 있어요.</p><div class="statline">${result}　 ·　 나 ${white}점　 :　 상대 ${black}점</div><p>${S.finish?.reason||'체크메이트 또는 무승부 규칙으로 종료'}</p><button class="btn primary full" id="reviewButton">기보와 평가 복기</button><button class="btn full" id="newGameButton">새 게임</button></div></div>`;$('reviewButton').onclick=()=>{$('modalHost').innerHTML='';render()};$('newGameButton').onclick=newGame}
function prepSummary(){if(S.mode!=='prep')return'';let d=S.settlement,summary=d?`${S.finish?.reason||'라운드 종료'} · 기본 ${d.base}G + 플레이 ${d.earned}G + 이자 ${d.interest||0}G = +${d.total}G`:'정비 단계';return`${summary} · 표준 포지션 · 레벨 ${S.level} 배치 ${deploymentRows()}행`}
function positionKey(board,side){let state=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++){let p=board[y][x];if(p)state.push(`${x}${y}${p.color}${p.kind}${p.star}${p.hp}${p.ability||''}${p.hasMoved?'m':''}`)}state.push(side,board.ep?`${board.ep.x}${board.ep.y}`:'-');return state.join('|')}

function renderBoard(){let el=$('board');el.innerHTML='';for(let vy=7;vy>=0;vy--)for(let x=0;x<8;x++){let y=vy,cell=document.createElement('button');cell.className='sq '+((x+y)%2?'dark':'light');cell.setAttribute('role','gridcell');cell.setAttribute('aria-label',String.fromCharCode(97+x)+(y+1));let p=S.board[y][x];if(S.lastMove&&((S.lastMove.fx===x&&S.lastMove.fy===y)||(S.lastMove.tx===x&&S.lastMove.ty===y)))cell.classList.add('last');if((S.mode==='battle'&&S.selected&&typeof S.selected==='object'&&S.selected.x===x&&S.selected.y===y)||(S.mode==='prep'&&p?.id===S.selected))cell.classList.add('selected');if(S.mode==='battle'&&S.legal.some(m=>m.tx===x&&m.ty===y)){cell.classList.add('legal');if(p)cell.classList.add('capture')}if(p){let glyph=document.createElement('span');glyph.textContent=icon(p.kind,p.color);glyph.className='piece '+p.color+(p.ability?' special':'');if(p.kind==='decoy')glyph.style.opacity='.45';cell.appendChild(glyph);if(p.star>1){let star=document.createElement('span');star.className='star';star.textContent='★'+p.star;cell.appendChild(star)}if(p.star>1||p.hp<p.maxHp){let hp=document.createElement('span');hp.className='hp';hp.textContent=p.hp+'/'+p.maxHp;cell.appendChild(hp)}}cell.onclick=()=>clickSquare(x,y);el.appendChild(cell)}}
function render(){if(!S.board)S.board=makeBoard();renderBoard();let phase=PHASES[S.round-1],limit=currentStageLimit(),known=OPENINGS.find(f=>f.id===S.formation);$('phasePill').textContent=phase+' 라운드';$('stageLabel').textContent=`STAGE 0${S.round} / ${['OPENING','MIDGAME','LATE GAME','ENDGAME'][S.round-1]}`;$('levelTop').textContent=S.level;$('fieldTop').textContent=`${fieldCost()} / ${fieldCap()}`;$('goldTop').textContent=S.gold;$('levelValue').textContent=S.level;$('goldValue').textContent=S.gold;$('levelBar').style.width=Math.min(100,S.level/6*100)+'%';$('goldBar').style.width=Math.min(100,S.gold/40*100)+'%';let price=({1:10,2:15,3:22,4:30,5:40}[S.level]||50);$('levelBtn').innerHTML=`레벨업 <span class="cost">${price}G</span>`;$('levelBtn').disabled=S.mode!=='prep'||S.level>=6||S.gold<price;$('rerollBtn').disabled=S.mode!=='prep'||S.gold<2;$('levelNote').textContent=`필드 ${fieldCap()} · 배치 ${deploymentRows()}행 · 10/17/25수 단계`;let title=S.mode==='prep'?'군대 정비':S.mode==='finished'?'엔드 게임 복기':phase==='오프닝'?'왕의 첫 수':known?.name||phase+' 포지션';$('boardTitle').textContent=title;$('boardSub').textContent=S.mode==='prep'?prepSummary():S.mode==='finished'?(S.finish?.reason||'게임 종료'):S.round===1?'표준 시작 배치 · 10수까지 대국':`${known?.name||phase} 시작 포지션 · ${phase==='엔드'?'끝날 때까지':`${limit}수까지 진행`}`;$('turnTag').textContent=S.mode==='prep'?'DEPLOY PHASE':S.mode==='finished'?'POST-GAME REVIEW':S.pendingExtra?'BONUS MOVE':S.abilityMode?'SPECIAL ACTION':S.side==='w'?'WHITE TO MOVE':'ENGINE THINKING';$('moveCount').textContent=`${S.stageMoves} / ${Number.isFinite(limit)?limit:'∞'}`;$('roundGold').textContent=`${S.roundEarned}G`;$('startBtn').style.display=S.mode==='prep'?'inline-block':'none';$('startBtn').textContent=S.round>=4?'게임 재개 →':`${PHASES[S.round]} 시작 →`;$('startBtn').disabled=fieldCost()>fieldCap()||S.pendingAbilityUnits.length>0;$('statusLine').textContent=S.statusText||(S.mode==='prep'?'기물 배치 또는 오프닝을 선택하세요.':S.mode==='battle'?(S.abilityMode?'특수 능력의 목표를 선택하세요.':S.pendingExtra?'추가 이동을 선택하세요.':S.side==='w'?'기물을 선택하고 이동할 칸을 누르세요.':'엔진 차례입니다…'):'기록에서 수별 평가를 확인할 수 있습니다.');$('winStreak').textContent=S.winStreak;$('lossStreak').textContent=S.lossStreak;$('streakHint').textContent=`연속 최선 수 보너스: ${Math.floor(S.winStreak/2)}G · 단계 정산 시 지급`;$('selectedLabel').textContent=S.selected?(S.white.find(p=>p.id===S.selected)?.kind?`${NAME[S.white.find(p=>p.id===S.selected).kind]} 선택`:'판 위 기물 선택'):'선택 없음';$('evalLocked').style.display=S.mode==='finished'?'none':'grid';$('evalDetail').style.display=S.mode==='finished'?'block':'none';$('streakPanel').style.display=S.mode==='finished'?'block':'none';renderOffers();renderFormations();renderBench();renderWorkshop();renderLog();renderAbilityAction();let selected=typeof S.selected==='string'?S.white.find(p=>p.id===S.selected):null;$('benchBtn').disabled=S.mode!=='prep'||!selected||!selected.inField;$('sellBtn').disabled=S.mode!=='prep'||!selected}
function renderOffers(){let el=$('offers');el.replaceChildren();for(let i=0;i<S.offers.length;i++){let o=S.offers[i];if(!o){let empty=document.createElement('div');empty.className='offer offer-empty';empty.innerHTML='<span>빈 칸</span><small>리롤 또는 다음 라운드</small>';el.append(empty);continue}let btn=document.createElement('button');btn.type='button';btn.className='offer';btn.disabled=S.mode!=='prep'||S.gold<o.price;btn.innerHTML=`<span class="glyph">${icon(o.kind,'w')}</span><b>${NAME[o.kind]}</b><small>${o.price}G · 필드 ${BASE[o.kind]}점</small>`;btn.onclick=()=>buyOffer(i);el.append(btn)}}
function openingGroup(f){let first=(f.line||[])[0]||'';return f.special?'etc':first.startsWith('d2d4')?'d4':first.startsWith('e2e4')?'e4':'etc'}
function renderFormationTabs(){let el=$('formationTabs');if(!el)return;let groups=[['d4','d4 오프닝'],['e4','e4 오프닝'],['etc','etc']];el.innerHTML='';for(const[id,label]of groups){let btn=document.createElement('button');btn.type='button';btn.className='formation-tab '+(S.formationCategory===id?'active':'');btn.textContent=label;btn.setAttribute('aria-pressed',S.formationCategory===id?'true':'false');btn.onclick=()=>{S.formationCategory=id;renderFormations()};el.append(btn)}}
function renderFormations(){renderFormationTabs();let el=$('formations');if(!el)return;el.innerHTML='';for(const f of OPENINGS.filter(item=>openingGroup(item)===S.formationCategory)){let chk=canForm(f),btn=document.createElement('button');btn.className='formation '+(S.formation===f.id?'active':'');btn.disabled=S.mode!=='prep'||!chk.ok;let depth=(f.line||[]).length/2,tag=f.special?'특수 해금':`Lv.${f.level} · ${depth}수`;btn.innerHTML=`<span><strong>${f.name}</strong><small>${f.desc}</small></span><span class="unlock">${chk.ok?`${chk.cost}C`:`${tag}`}</span>`;btn.title=chk.ok?`${depth}수 포지션 · ${chk.cost} 필드 코스트`:chk.why;btn.onclick=()=>formationArmy(f.id);el.append(btn)}}
function renderBench(){let bench=S.white.filter(p=>p.alive&&!p.inField);$('benchCount').textContent=bench.length+'기물';let el=$('benchList');el.innerHTML='';if(!bench.length){el.innerHTML='<span class="empty-note">대기석이 비어 있습니다.</span>';return}for(const p of bench){let btn=document.createElement('button');btn.className='unit-chip '+(S.selected===p.id?'selected':'');btn.innerHTML=`<span class="uniticon">${icon(p.kind,'w')}</span>${NAME[p.kind]}<small>★${p.star}</small>`;btn.title=`코스트 ${cost(p)} · ${p.hp}/${p.maxHp} 목숨`;btn.onclick=()=>{S.selected=p.id;render()};el.append(btn)}}
function renderWorkshop(){let report=$('unitReport'),picker=$('abilityPicker');picker.innerHTML='';let selected=typeof S.selected==='string'?S.white.find(p=>p.id===S.selected):null;if(S.pendingAbilityUnits.length){let p=S.white.find(z=>z.id===S.pendingAbilityUnits[0]);if(p){report.innerHTML=`<b>${NAME[p.kind]} ★3</b> · 목숨 ${p.hp}/${p.maxHp}<br>특수 능력을 하나 고르세요.`;for(const[id,name,desc]of ABILITY_OPTIONS[p.kind]){let btn=document.createElement('button');btn.className='ability-choice';btn.innerHTML=`<strong>${name}</strong><small>${desc}</small>`;btn.onclick=()=>chooseAbility(p.id,id);picker.append(btn)}return}}if(!selected){report.textContent='작업할 기물을 선택하세요.';return}let candidates=S.white.filter(p=>p.alive&&!p.inField&&p.kind===selected.kind&&p.star===selected.star).length,need=selected.star===1?3:selected.star===2?2:0;report.innerHTML=`<b>${NAME[selected.kind]} ★${selected.star}</b> · 목숨 ${selected.hp}/${selected.maxHp} · 코스트 ${cost(selected)} · 판매 ${saleValue(selected)}G<br>${need?`대기석 동일 기물 ${Math.min(candidates,need)}/${need} · 대기석에서만 자동 합성`:selected.ability?`능력: ${ABILITY_OPTIONS[selected.kind].find(a=>a[0]===selected.ability)?.[1]||selected.ability}`:'★3 합성 대기'}`}
function renderLog(){let el=$('moveLog'),review=S.mode==='finished';$('logCount').textContent=S.log.length+' 수';if(!S.log.length){el.innerHTML='<div class="empty-note">첫 수를 기다리는 중</div>';return}let entries=review?S.log.slice().reverse():S.log.slice(-24).reverse();el.innerHTML=entries.map((x,i)=>{let rating=review?`${x.quality||'—'}${x.regret!=null?' · −'+x.regret.toFixed(1):''}`:x.color==='w'?'내 수':'엔진';let value=S.playerColor==='b'?-x.score:x.score;let score=review&&x.score!=null?`<small class="review-score">${x.color==='w'?'내 수':'엔진'} · 평가 ${value>=0?'+':''}${value.toFixed(1)}</small>`:'';return`<div class="log-item"><time>R${x.round}</time><span>${x.move}${score}</span><b class="${review&&x.bad?'bad':''}">${rating}</b></div>`}).join('')}
function toast(msg){let el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(S.toastTimer);S.toastTimer=setTimeout(()=>el.classList.remove('show'),1900)}

function showStartMenu(){
 document.body.classList.add('start-screen');
 $('modalHost').innerHTML=`<div class="overlay"><div class="modal"><div class="eyebrow">RIFT CHESS</div><h2>게임 모드 선택</h2><p>싱글 플레이 또는 방 번호로 상대와 대국하는 멀티 플레이를 선택하세요.</p><button class="btn primary full" id="singleModeButton">싱글 플레이</button><button class="btn full" id="roomModeButton">멀티 플레이</button></div></div>`;
 $('singleModeButton').onclick=showSingleDifficulty;
 $('roomModeButton').onclick=showRoomLobby;
}
function showSingleDifficulty(){
 $('modalHost').innerHTML=`<div class="overlay"><div class="modal"><div class="eyebrow">SINGLE PLAYER</div><h2>엔진 난이도</h2><p>엔진 Elo는 난이도별 추정치이며, 진영은 백 또는 흑 중 무작위로 배정됩니다.</p><label class="menu-label" for="difficultySelect">난이도를 선택하세요</label><select class="menu-select" id="difficultySelect"><option value="easy">쉬움 · 약 500 Elo</option><option value="normal" selected>보통 · 약 1200 Elo</option><option value="hard">어려움 · 약 2000 Elo</option></select><button class="btn primary full" id="startSingleButton">게임 시작</button><button class="btn ghost full" id="backModeButton">뒤로</button></div></div>`;
 $('startSingleButton').onclick=()=>newGame($('difficultySelect').value);
 $('backModeButton').onclick=showStartMenu;
}
function showRoomLobby(){
 $('modalHost').innerHTML=`<div class="overlay"><div class="modal"><div class="eyebrow">ONLINE MATCH</div><h2>멀티 플레이</h2><p>방을 만들거나, 상대가 만든 방에 참가하세요.</p><button class="btn primary full" id="createRoomButton">방 생성</button><button class="btn full" id="openJoinRoomButton">방 참가</button><p class="hint">먼저 프로젝트 폴더에서 <code>node server.js</code>를 실행하고 <code>http://localhost:4174</code>을 여세요.</p><button class="btn ghost full" id="backMenuButton">뒤로</button></div></div>`;
 $('createRoomButton').onclick=()=>connectRoom('create');
 $('openJoinRoomButton').onclick=showJoinRoomForm;
 $('backMenuButton').onclick=showStartMenu;
}
function showJoinRoomForm(){
 $('modalHost').innerHTML=`<div class="overlay"><div class="modal"><div class="eyebrow">JOIN ROOM</div><h2>방 번호 입력</h2><p>방장이 알려준 6자리 숫자 코드를 입력하세요.</p><div class="room-join"><input id="roomNumberInput" inputmode="numeric" maxlength="6" placeholder="예: 482731" aria-label="6자리 방 번호"><button class="btn primary" id="joinRoomButton">입장</button></div><button class="btn ghost full" id="backLobbyButton">뒤로</button></div></div>`;
 $('joinRoomButton').onclick=()=>connectRoom('join',$('roomNumberInput').value.trim());
 $('roomNumberInput').onkeydown=event=>{if(event.key==='Enter')connectRoom('join',$('roomNumberInput').value.trim())};
 $('backLobbyButton').onclick=showRoomLobby;
}
function connectRoom(action,code=''){
 if(action==='join'&&!/^\d{6}$/.test(code)){toast('6자리 방 번호를 입력하세요.');return}
 roomConnectAction=action;
 if(roomSocket){roomSocket.onclose=null;roomSocket.close();roomSocket=null}
 let endpoint=`${location.protocol==='https:'?'wss':'ws'}://${location.host||'localhost:4174'}/ws`;
 try{roomSocket=new WebSocket(endpoint)}catch{toast('방 서버에 연결할 수 없습니다.');return}
 const ws=roomSocket;
 $('modalHost').innerHTML=`<div class="overlay"><div class="modal"><div class="eyebrow">CONNECTING</div><h2>${action==='create'?'방을 만들고 있어요':'방에 입장하고 있어요'}</h2><p>잠시만 기다려 주세요.</p><button class="btn ghost full" id="cancelConnectButton">취소</button></div></div>`;
 $('cancelConnectButton').onclick=()=>{ws.onclose=null;ws.close();if(roomSocket===ws)roomSocket=null;action==='join'?showJoinRoomForm():showRoomLobby()};
 ws.onopen=()=>ws.send(JSON.stringify({type:action,code}));
 ws.onmessage=event=>{let message;try{message=JSON.parse(event.data)}catch{return}handleRoomMessage(message)};
 ws.onerror=()=>toast('연결에 실패했습니다. node server.js를 실행했는지 확인하세요.');
 ws.onclose=()=>{if(roomSocket===ws)roomSocket=null;if(S.gameMode==='multi'&&S.mode==='roomBattle')finishRoomGame(S.playerColor,'연결이 끊겼습니다.')};
}
function enterRoom(side,code){
 S=initialState();S.gameMode='multi';S.mode='roomPrep';S.playerColor=side;S.roomCode=code;S.roomPeerConnected=side==='b';S.roomPeerReady=false;S.roomSelfReady=false;S.roomOwnFormation='standard';S.formation='standard';S.board=standardOpeningBoard();S.positionCounts={};recordPosition();$('modalHost').innerHTML='';document.body.classList.remove('start-screen');render();toast(`방 번호 ${code} · 상대에게 공유하세요.`);
}
function roomSend(message){if(roomSocket?.readyState===WebSocket.OPEN)roomSocket.send(JSON.stringify(message))}
function handleRoomMessage(message){
 if(message.type==='created'||message.type==='joined'){enterRoom(message.side,message.code);return}
 if(message.type==='error'){let text=message.message||'방 요청에 실패했습니다.';if($('cancelConnectButton')){if(roomSocket){roomSocket.onclose=null;roomSocket.close();roomSocket=null}roomConnectAction==='join'?showJoinRoomForm():showRoomLobby()}else if(S.mode==='roomPrep'){S.roomSelfReady=false;S.statusText=text;render()}toast(text);return}
 if(message.type==='peer-joined'){S.roomPeerConnected=true;S.statusText='참가자가 입장했습니다. 방장이 게임 시작을 누를 수 있습니다.';render();return}
 if(message.type==='peer-ready'){S.roomPeerConnected=true;S.roomPeerReady=true;S.statusText='상대가 연결되었습니다. 방장이 게임 시작을 누르면 대국이 시작됩니다.';render();return}
 if(message.type==='peer-waiting'){S.roomPeerReady=false;S.roomSelfReady=false;S.mode='roomPrep';S.statusText='표준 체스로 시작합니다. 참가자를 기다려 주세요.';render();return}
 if(message.type==='peer-left'){S.roomPeerConnected=false;S.roomPeerReady=false;if(S.mode==='roomBattle'){finishRoomGame(S.playerColor,'상대가 방을 나갔습니다.')}else{S.statusText='상대와 연결이 끊겼습니다.';render()}return}
 if(message.type==='start'){
  if(!setupRoomPosition('standard','standard')){S.mode='roomPrep';S.roomSelfReady=false;S.roomPeerReady=false;S.roomOwnFormation='standard';S.formation='standard';S.board=standardOpeningBoard();S.statusText='표준 포지션을 불러오지 못했습니다. 방을 다시 시작해 주세요.';roomSend({type:'unready'});toast('표준 포지션을 불러오지 못했습니다.');render();return}
  S.statusText='표준 체스 대국이 시작됐습니다.';render();toast('표준 체스 대국 시작');return;
 }
 if(message.type==='move'){applyRoomMove(message.move,message.side,false)}
 if(message.type==='end'){finishRoomGame(message.outcome,message.reason||'서버가 대국을 종료했습니다.');return}
}
function selectRoomFormation(id){const f=OPENINGS.find(x=>x.id===id);if(!f||f.special||S.roomSelfReady)return;S.roomOwnFormation=id;S.formation=id;S.board=replayFormationBoard(id,S.playerColor)||standardOpeningBoard();S.selected=null;S.legal=[];S.statusText='상대에게는 진형 선택이 숨겨져 있습니다.';roomSend({type:'select',formation:id});render()}
function readyRoom(){if(S.mode!=='roomPrep'||S.playerColor!=='w'||S.roomSelfReady)return;if(!S.roomPeerConnected){toast('참가자가 들어올 때까지 시작할 수 없습니다.');return}S.roomSelfReady=true;S.statusText='대국을 준비하고 있습니다.';roomSend({type:'begin'});render()}
function scoreRoomCandidate(board,move,color){let after=applyMove(board,move),reply=legalMoves(after,color==='w'?'b':'w');if(!reply.length)return staticEval(after);let scores=reply.map(r=>staticEval(applyMove(after,r)));return color==='w'?Math.min(...scores):Math.max(...scores)}
function classifyRoomMove(move,color){let moves=legalMoves(S.board,color),actual=scoreRoomCandidate(S.board,move,color),values=moves.map(m=>scoreRoomCandidate(S.board,m,color)),best=color==='w'?Math.max(...values):Math.min(...values),regret=Math.max(0,color==='w'?best-actual:actual-best),[quality,,kind]=qualityFor(regret);return{quality,kind,regret}}
function applyRoomMove(move,side,send){if(S.mode!=='roomBattle'||S.side!==side)return;let legal=legalMoves(S.board,side),m=legal.find(x=>x.fx===move.fx&&x.fy===move.fy&&x.tx===move.tx&&x.ty===move.ty);if(!m){toast('상대 수와 보드가 맞지 않습니다.');return}let analysis=classifyRoomMove(m,side),result=applyLiveMove(m);addLog(result.label,side,analysis.quality,analysis.kind==='bad',staticEval(S.board),analysis.regret);S.side=side==='w'?'b':'w';if(side==='b')S.stageMoves++;S.selected=null;S.legal=[];S.statusText=S.side===S.playerColor?'내 차례입니다.':'상대 차례입니다.';if(send)roomSend({type:'move',move:{fx:m.fx,fy:m.fy,tx:m.tx,ty:m.ty}});if(checkRoomEnd())return;render()}
function checkRoomEnd(){let white=unitsOnBoard('w'),black=unitsOnBoard('b');if(!white.length){finishRoomGame('b','화이트 기물이 모두 잡혔습니다.');return true}if(!black.length){finishRoomGame('w','블랙 기물이 모두 잡혔습니다.');return true}let moves=legalMoves(S.board,S.side);if(!moves.length){if(inCheck(S.board,S.side))finishRoomGame(S.side==='w'?'b':'w','체크메이트');else finishRoomGame('draw','스테일메이트');return true}if(S.halfmoveClock>=100){finishRoomGame('draw','50수 규칙 무승부');return true}if(insufficientMaterial()){finishRoomGame('draw','기물 부족 무승부');return true}if(recordPosition()>=3){finishRoomGame('draw','동일 포지션 3회 반복 무승부');return true}return false}
function finishRoomGame(outcome,reason){if(S.mode==='finished')return;S.mode='finished';S.finish={outcome,reason};S.selected=null;S.legal=[];showFinal();render()}
function returnToStartMenu(){if(roomSocket){roomSend({type:'leave'});roomSocket.close();roomSocket=null}S=initialState();S.board=makeBoard();freshOffers();recordPosition();render();showStartMenu()}

const campaignRenderFormations=renderFormations;
renderFormations=function(){campaignRenderFormations()};
const campaignRenderLog=renderLog;
renderLog=function(){if(S.gameMode!=='multi'){campaignRenderLog();return}let el=$('moveLog'),review=S.mode==='finished';$('logCount').textContent=S.log.length+' 수';if(!S.log.length){el.innerHTML='<div class="empty-note">첫 수를 기다리는 중</div>';return}let entries=review?S.log.slice().reverse():S.log.slice(-24).reverse();el.innerHTML=entries.map(x=>{let rating=review?`${x.quality||'—'}${x.regret!=null?' · −'+x.regret.toFixed(1):''}`:x.color===S.playerColor?'내 수':'상대';let value=S.playerColor==='b'?-x.score:x.score,score=review&&x.score!=null?`<small class="review-score">평가 ${value>=0?'+':''}${value.toFixed(1)}</small>`:'';return`<div class="log-item"><time>R${x.round}</time><span>${x.move}${score}</span><b class="${review&&x.bad?'bad':''}">${rating}</b></div>`}).join('')};
const campaignRenderBoard=renderBoard;
renderBoard=function(){campaignRenderBoard();let board=$('board'),wrap=board.closest('.board-wrap'),blackCampaign=S.gameMode==='single'&&S.playerColor==='b',blackRoom=S.gameMode==='multi'&&S.playerColor==='b';board.classList.toggle('black-player-view',blackCampaign);board.classList.toggle('black-view',blackRoom);wrap.classList.toggle('black-view',blackRoom);if(S.gameMode==='single'){let files=wrap.querySelector('.coords.files').children,ranks=wrap.querySelector('.coords.ranks').children;for(let i=0;i<8;i++){files[i].textContent=String.fromCharCode((blackCampaign?104:97)+(blackCampaign?-i:i));ranks[i].textContent=String(blackCampaign?i+1:8-i)}if(blackCampaign)for(const cell of board.children){let square=squareIndex(cell.getAttribute('aria-label')),piece=S.board[square.y][square.x];if(!piece)continue;let glyph=cell.querySelector('.piece');if(glyph){let displayColor=piece.color==='w'?'b':'w';glyph.textContent=icon(piece.kind,displayColor);glyph.classList.remove('w','b');glyph.classList.add(displayColor)}}}if(S.gameMode!=='multi')return;for(const cell of board.children){let square=squareIndex(cell.getAttribute('aria-label')),piece=S.board[square.y][square.x];if(S.mode==='roomPrep'&&piece&&piece.color!==S.playerColor){cell.innerHTML='';continue}if(S.mode==='roomBattle'){if(S.selected&&typeof S.selected==='object'&&S.selected.x===square.x&&S.selected.y===square.y)cell.classList.add('selected');if(S.legal.some(m=>m.tx===square.x&&m.ty===square.y)){cell.classList.add('legal');if(piece)cell.classList.add('capture')}}}};
const campaignClickSquare=clickSquare;
clickSquare=function(x,y){if(S.mode!=='roomBattle'){campaignClickSquare(x,y);return}if(S.side!==S.playerColor)return;let piece=S.board[y][x];if(S.selected){let move=S.legal.find(m=>m.tx===x&&m.ty===y);if(move){moveSelected(move);return}}if(piece?.color===S.playerColor){S.selected={x,y};S.legal=legalMoves(S.board,S.playerColor).filter(m=>m.fx===x&&m.fy===y)}else{S.selected=null;S.legal=[]}S.statusText='';render()};
const campaignMoveSelected=moveSelected;
moveSelected=function(move){if(S.mode==='roomBattle'){if(S.side!==S.playerColor)return;applyRoomMove(move,S.playerColor,true);return}campaignMoveSelected(move)};
const campaignRender=render;
render=function(){document.body.classList.toggle('room-mode',S.gameMode==='multi');campaignRender();if(S.gameMode!=='multi'){document.querySelector('.brand-sub').textContent='A CHESS AUTO-BATTLER PROTOTYPE';if(S.gameMode==='single'){if(S.round===1&&S.mode==='battle')$('boardSub').textContent=`표준 시작 · ${S.playerColor==='w'?'백':'흑'} 진영 · 엔진 약 ${difficultyElo(S.difficulty)} Elo · 10수`;if(S.playerColor==='b'&&S.mode==='battle')$('turnTag').textContent=S.side==='w'?'BLACK TO MOVE':'ENGINE THINKING'}return}document.querySelector('.brand-sub').textContent='ONLINE ROOM MATCH';let prep=S.mode==='roomPrep',battle=S.mode==='roomBattle';$('phasePill').textContent='멀티 대국';$('stageLabel').textContent=`ROOM ${S.roomCode}`;$('boardTitle').textContent=prep?`방 ${S.roomCode} · 진형 준비`:S.mode==='finished'?'대국 복기':`${OPENINGS.find(f=>f.id===S.roomWhiteFormation)?.name||'기본 진형'} vs ${OPENINGS.find(f=>f.id===S.roomBlackFormation)?.name||'기본 진형'}`;$('boardSub').textContent=prep?`내 진형: ${OPENINGS.find(f=>f.id===S.roomOwnFormation)?.name||'기본 체스'} · 상대 진형은 양쪽 준비 완료 후 공개됩니다.`:S.finish?.reason||`White ${OPENINGS.find(f=>f.id===S.roomWhiteFormation)?.name||'기본'} · Black ${OPENINGS.find(f=>f.id===S.roomBlackFormation)?.name||'기본'}`;$('turnTag').textContent=prep?(S.playerColor==='w'?(S.roomPeerConnected?(S.roomSelfReady?'STARTING':'시작 가능'):'참가자 대기'):'방장 시작 대기'):battle?(S.side===S.playerColor?'YOUR TURN':'WAITING FOR OPPONENT'):'POST-GAME REVIEW';$('moveCount').textContent=prep?(S.roomPeerConnected?'상대 연결됨':'상대 대기'):S.stageMoves+' 수';$('roundGold').textContent='—';$('startBtn').style.display=prep&&S.playerColor==='w'?'inline-block':'none';$('startBtn').textContent=S.roomPeerConnected?'게임 시작 →':'참가자 대기 중';$('startBtn').disabled=!S.roomPeerConnected||S.roomSelfReady;$('statusLine').textContent=S.statusText||(prep?(!S.roomPeerConnected?'참가자가 입장하면 방장이 게임을 시작할 수 있습니다.':S.playerColor==='w'?'참가자가 입장했습니다. 게임 시작을 누르세요.':'진형을 선택하고 방장이 시작하기를 기다리세요.'):battle?(S.side===S.playerColor?'내 차례입니다.':'상대가 두고 있습니다.'):'기보와 최종 평가를 확인하세요.');};
const campaignShowFinal=showFinal;
showFinal=function(){if(S.gameMode!=='multi'){campaignShowFinal();$('newGameButton').textContent='처음 화면';$('newGameButton').onclick=returnToStartMenu;return}S.mode='finished';let mine=materialTotal(S.playerColor==='w'?S.white:S.black),theirs=materialTotal(S.playerColor==='w'?S.black:S.white),result=S.finish?.outcome==='draw'?'무승부':S.finish?.outcome===S.playerColor?'승리':'패배';refreshEval();$('modalHost').innerHTML=`<div class="overlay"><div class="modal"><div class="eyebrow">ONLINE MATCH COMPLETE</div><h2>대국 종료 · ${result}</h2><p>상대 진형이 공개된 뒤의 수순을 복기할 수 있어요.</p><div class="statline">내 기물 점수 ${mine}　 :　 상대 ${theirs}</div><p>${S.finish?.reason||'대국 종료'}</p><button class="btn primary full" id="reviewButton">기보 복기</button><button class="btn full" id="newGameButton">처음 화면</button></div></div>`;$('reviewButton').onclick=()=>{$('modalHost').innerHTML='';render()};$('newGameButton').onclick=returnToStartMenu};

const standardRoomShowFinal=showFinal;
showFinal=function(){standardRoomShowFinal();if(S.gameMode==='multi')document.querySelector('#modalHost .modal p').textContent='표준 체스 대국의 수순을 복기할 수 있어요.'};
const prepMoveRenderBoard=renderBoard;
renderBoard=function(){prepMoveRenderBoard();if(S.mode!=='prep'||S.preMovesRemaining<=0||S.side!=='w')return;let board=$('board');for(const cell of board.children){let square=squareIndex(cell.getAttribute('aria-label'));if(S.legal.some(m=>m.tx===square.x&&m.ty===square.y))cell.classList.add('legal')}};
const levelSetupRender=render;
render=function(){levelSetupRender();if(S.gameMode==='multi'){let prep=S.mode==='roomPrep';$('boardTitle').textContent=prep?`방 ${S.roomCode} · 대기실`:S.mode==='finished'?'대국 복기':'표준 체스 대국';$('boardSub').textContent=prep?'표준 체스로 시작합니다. 참가자가 들어오면 방장이 대국을 시작할 수 있습니다.':S.finish?.reason||`방 ${S.roomCode} · 표준 체스`;if(prep){$('turnTag').textContent=S.playerColor==='w'?(S.roomPeerConnected?'게임 시작 가능':'참가자 대기'):'방장 시작 대기';$('statusLine').textContent=S.statusText||(S.roomPeerConnected?(S.playerColor==='w'?'참가자가 입장했습니다. 게임 시작을 누르세요.':'방장이 게임을 시작하기를 기다리세요.'):'참가자가 입장하면 방장이 게임을 시작할 수 있습니다.')}return}$('levelNote').textContent=`필드 ${fieldCap()} · 배치 ${deploymentRows()}행 · 상점 확률은 레벨에 따라 조정`;if(S.mode==='prep'){$('boardTitle').textContent='군대 정비';$('statusLine').textContent=S.statusText||'기본 기물은 같은 종류의 원래 칸끼리만 이동할 수 있습니다. 퀸과 킹은 이동할 수 없습니다.'}if(S.mode==='battle'){if(S.round===1){$('boardTitle').textContent='왕의 첫 수';$('boardSub').textContent=`표준 체스 · ${S.playerColor==='w'?'백':'흑'} · 엔진 약 ${difficultyElo(S.difficulty)} Elo · 오프닝 10수`}else{$('boardTitle').textContent=`${PHASES[S.round-1]} · 레벨 ${S.level}`;$('boardSub').textContent=`표준 포지션 · 내 진영 배치 ${deploymentRows()}행 · 선공 ${S.level}수`}if(S.preMovesRemaining>0&&S.side==='w'){$('turnTag').textContent=`선공 · ${S.preMovesRemaining}수 남음`;$('statusLine').textContent=S.statusText||`엔진 응수 전 ${S.preMovesRemaining}수를 둘 수 있습니다.`}}};

const prepControlsRender=render;
render=function(){prepControlsRender();if(S.gameMode==='multi'||S.mode!=='prep'){$('undoPrepMoveBtn').style.display='none';return}$('undoPrepMoveBtn').style.display=S.prepMoveUndo.length?'inline-block':'none';$('undoPrepMoveBtn').disabled=!S.prepMoveUndo.length;$('levelNote').textContent=`필드 ${fieldCap()} · 배치 ${deploymentRows()}행 · 선행 수 ${S.preMovesRemaining}/${S.level} · 이자 10G당 1G (최대 5G)`;if(!hasFieldKing()){$('statusLine').textContent='필드에 내 킹 1개가 있어야 라운드를 시작할 수 있습니다.';$('startBtn').disabled=true}else if(!S.statusText||!S.statusText.startsWith('정비 선행 수')){$('statusLine').textContent=`정비 선행 수 ${S.preMovesRemaining}/${S.level} · 비어 있는 칸으로 미리 두고, 필요하면 되돌릴 수 있습니다.`}};

let activeDrag=null,ignoreBoardClick=false;
function paintDragTargets(){let board=$('board'),name=(x,y)=>String.fromCharCode(97+x)+(y+1);for(const cell of board.children)cell.classList.remove('selected','legal','capture');if(!S.selected||typeof S.selected!=='object')return;board.querySelector(`[aria-label="${name(S.selected.x,S.selected.y)}"]`)?.classList.add('selected');for(const m of S.legal){let cell=board.querySelector(`[aria-label="${name(m.tx,m.ty)}"]`);cell?.classList.add('legal');if(S.board[m.ty][m.tx])cell?.classList.add('capture')}}
function placeDragGhost(event){if(!activeDrag?.ghost)return;activeDrag.ghost.style.left=event.clientX+'px';activeDrag.ghost.style.top=event.clientY+'px'}
function createDragGhost(drag,event){let ghost=document.createElement('div');ghost.className='drag-ghost';for(const selector of ['.piece','.star','.hp']){let part=drag.cell.querySelector(selector);if(part)ghost.append(part.cloneNode(true))}document.body.append(ghost);drag.ghost=ghost;document.body.classList.add('dragging');placeDragGhost(event)}
function clearDragVisual(drag){drag?.ghost?.remove();drag?.cell?.classList.remove('drag-origin');document.body.classList.remove('dragging')}
function installDragControls(){const board=$('board');board.addEventListener('pointerdown',event=>{let cell=event.target.closest('.sq');if(!cell||!['battle','roomBattle'].includes(S.mode)||S.abilityMode)return;let pos=squareIndex(cell.getAttribute('aria-label')),piece=S.board?.[pos.y]?.[pos.x],color=S.mode==='roomBattle'?S.playerColor:'w';if(!piece||S.side!==color||piece.color!==color||(S.pendingExtra&&piece.id!==S.pendingExtra.id))return;S.selected={x:pos.x,y:pos.y};S.legal=legalMoves(S.board,color,S.pendingExtra?.id||null).filter(m=>m.fx===pos.x&&m.fy===pos.y);paintDragTargets();activeDrag={from:pos,startX:event.clientX,startY:event.clientY,moved:false,cell,pointerId:event.pointerId,ghost:null};try{cell.setPointerCapture(event.pointerId)}catch{}});document.addEventListener('pointermove',event=>{if(!activeDrag||event.pointerId!==activeDrag.pointerId)return;if(!activeDrag.moved&&Math.hypot(event.clientX-activeDrag.startX,event.clientY-activeDrag.startY)>7){activeDrag.moved=true;activeDrag.cell.classList.add('drag-origin');createDragGhost(activeDrag,event)}if(activeDrag.moved)placeDragGhost(event)});document.addEventListener('pointerup',event=>{if(!activeDrag||event.pointerId!==activeDrag.pointerId)return;let drag=activeDrag;activeDrag=null;clearDragVisual(drag);if(!drag.moved)return;ignoreBoardClick=true;setTimeout(()=>{ignoreBoardClick=false},160);let target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.sq');if(!target){toast('이동 가능한 칸에 놓으세요.');return}let to=squareIndex(target.getAttribute('aria-label')),move=S.legal.find(m=>m.fx===drag.from.x&&m.fy===drag.from.y&&m.tx===to.x&&m.ty===to.y);if(move)moveSelected(move);else toast('이 칸으로는 움직일 수 없습니다. 다시 이동할 수 있습니다.')});document.addEventListener('pointercancel',event=>{if(activeDrag&&event.pointerId===activeDrag.pointerId){clearDragVisual(activeDrag);activeDrag=null}});board.addEventListener('click',event=>{if(ignoreBoardClick){event.preventDefault();event.stopImmediatePropagation();ignoreBoardClick=false}},true)}
installDragControls();

const regularMoveSelected=moveSelected;
moveSelected=function(move){if(S.mode==='prep'){if(S.preMovesRemaining>0)playPrepMove(move);else clickSquare(move.tx,move.ty);return}regularMoveSelected(move)};
const boardElement=$('board');
boardElement.addEventListener('pointerdown',event=>{let cell=event.target.closest('.sq');if(!cell||S.mode!=='prep')return;let from=squareIndex(cell.getAttribute('aria-label')),piece=S.board[from.y][from.x];if(!piece||piece.color!=='w')return;let legal=S.preMovesRemaining>0&&S.side==='w'?prepMovesFrom(piece.id):prepRestrictedMovesFrom(piece.id);if(!legal.length)return;activeDrag={from,startX:event.clientX,startY:event.clientY,moved:false,cell,pointerId:event.pointerId,ghost:null,prep:true,pieceId:piece.id,prepLegal:legal,prepActivated:false};try{cell.setPointerCapture(event.pointerId)}catch{}});
document.addEventListener('pointermove',event=>{if(!activeDrag?.prep||event.pointerId!==activeDrag.pointerId||!activeDrag.moved||activeDrag.prepActivated)return;activeDrag.prepActivated=true;S.selected=activeDrag.pieceId;S.legal=activeDrag.prepLegal;let board=$('board');for(const cell of board.children)cell.classList.remove('selected','legal','capture');activeDrag.cell.classList.add('selected');for(const move of S.legal)board.querySelector(`[aria-label="${coord(move.tx,move.ty)}"]`)?.classList.add('legal')});

$('levelBtn').onclick=buyLevel;$('rerollBtn').onclick=reroll;$('benchBtn').onclick=benchSelected;$('sellBtn').onclick=sellSelected;$('undoPrepMoveBtn').onclick=undoPrepMove;$('startBtn').onclick=()=>S.mode==='roomPrep'?readyRoom():openNextRound();
// The opponent has its own economy and uses the maintenance phase to grow its army.
const originalInitialStateForBot=initialState;
function addBotState(state){Object.assign(state,{botLevel:1,botGold:5,botOffers:[],botOfferSeed:31,botNextUnit:1,botPreMovesRemaining:0,botRoundEarned:0,botGoodStreak:0,prepLastMover:null,botPrepBoard:null});return state}
initialState=function(){return addBotState(originalInitialStateForBot())};
addBotState(S);

function levelPrice(level){return({1:10,2:15,3:22,4:30,5:40}[level]||50)}
function rowsForLevel(level){return Math.min(4,2+Math.floor((level-1)/2))}
function botFieldCap(){return 41+(S.botLevel-1)*10}
function botArmyCost(){return S.black.filter(p=>p.alive&&p.inField).reduce((sum,p)=>sum+cost(p),0)}
function botRows(){return rowsForLevel(S.botLevel)}
function botCoreId(id){return /^b(?:P[0-7]|B[0-7])$/.test(id)}
function botMakeOffers(){let d=Math.max(0,Math.min(5,S.botLevel-1)),weights={p:48-d,n:16+d*.15,b:16+d*.15,r:10+d*.3,q:5+d*.35,k:5+d*.05},kinds=Object.keys(weights),total=Object.values(weights).reduce((a,b)=>a+b,0),seed=S.botOfferSeed=(S.botOfferSeed*9301+49297)%233280,rnd=()=>{seed=(seed*9301+49297)%233280;return seed/233280};S.botOffers=[];for(let i=0;i<4;i++){let roll=rnd()*total,kind=kinds.find(k=>(roll-=weights[k])<0)||'p';S.botOffers.push({kind,price:BUY_PRICE[kind]})}}
makeBoard=function(){let b=Array.from({length:8},()=>Array(8).fill(null));for(const p of S.white.concat(S.black)){if(!p.alive||!p.inField)continue;let{x,y}=p.home,valid=p.color==='w'?y>=0&&y<rowsForLevel(S.level):y>=8-rowsForLevel(S.botLevel)&&y<8;if(!inside(x,y)||!valid||b[y][x]){let found=null,ys=p.color==='w'?Array.from({length:rowsForLevel(S.level)},(_,i)=>i):Array.from({length:rowsForLevel(S.botLevel)},(_,i)=>7-i);for(const yy of ys){for(let xx=0;xx<8;xx++)if(!b[yy][xx]){found=[xx,yy];break}if(found)break}if(!found){p.inField=false;continue}[x,y]=found;p.home={x,y}}p.x=x;p.y=y;b[y][x]=copyPiece(p)}b.ep=null;return b};
function syncBotBoard(){if(!S.board)return;let next=cloneBoard(S.board);for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(next[y][x]?.color==='b')next[y][x]=null;for(const p of S.black){if(!p.alive||!p.inField)continue;let{x,y}=p.home;if(!inside(x,y)||y<8-botRows()||y>7||next[y][x]){let slot=null;for(let yy=7;yy>=8-botRows()&&!slot;yy--)for(let xx=0;xx<8;xx++)if(!next[yy][xx]){slot=[xx,yy];break}if(!slot){p.inField=false;continue}[x,y]=slot;p.home={x,y}}p.x=x;p.y=y;next[y][x]=copyPiece(p)}S.board=next}
function botPieceValue(p){return(BASE[p.kind]||0)*p.star+(p.ability?ABILITY_COST[p.kind]||0:0)}
function botAutoFuse(trigger){let changed=true;while(changed&&trigger.alive&&!trigger.inField&&trigger.star<3){changed=false;let need=trigger.star===1?3:2,group=S.black.filter(p=>p.alive&&!p.inField&&p.kind===trigger.kind&&p.star===trigger.star&&!botCoreId(p.id)&&p.id!==trigger.id);if(group.length<need-1)break;let parts=[trigger,...group.slice(0,need-1)],royal=parts.some(p=>p.isRoyal),star=trigger.star+1,at={...trigger.home};S.black=S.black.filter(p=>!parts.includes(p));trigger=unit(`bF${S.botNextUnit++}`,'b',parts[0].kind,at.x,at.y,{star,hp:star===3?2:star,maxHp:star===3?2:star,isRoyal:royal,isCore:false,inField:false});if(star===3){trigger.ability=ABILITY_OPTIONS[trigger.kind]?.[0]?.[0]||null;trigger.hp=trigger.maxHp=2}S.black.push(trigger);changed=true}}
function botPlaceBench(){let candidates=S.black.filter(p=>p.alive&&!p.inField&&!botCoreId(p.id)&&(p.id.startsWith('bA')||p.id.startsWith('bF'))).sort((a,b)=>botPieceValue(b)-botPieceValue(a));for(const piece of candidates){let board=S.board,slot=null;for(let y=7;y>=8-botRows()&&!slot;y--)for(let x=0;x<8;x++)if(!board[y][x]){slot=[x,y];break}let victim=null;if(!slot){victim=S.black.filter(p=>p.alive&&p.inField&&!p.isRoyal).sort((a,b)=>botPieceValue(a)-botPieceValue(b))[0];if(victim&&botPieceValue(piece)<=botPieceValue(victim))victim=null;if(victim)slot=[victim.home.x,victim.home.y]}if(!slot)continue;let costAfter=botArmyCost()-(victim?cost(victim):0)+cost(piece);if(costAfter>botFieldCap())continue;if(victim)victim.inField=false;piece.inField=true;piece.home={x:slot[0],y:slot[1]};piece.x=slot[0];piece.y=slot[1];if(!victim)board[slot[1]][slot[0]]=copyPiece(piece);else board[slot[1]][slot[0]]=copyPiece(piece)}}
function botLevelTarget(){let offset=S.difficulty==='hard'?2:S.difficulty==='normal'?1:0;return Math.min(6,Math.max(1,S.level+offset))}
function botPrepare(){if(S.gameMode!=='single'||S.mode!=='prep')return;let oldLevel=S.botLevel,target=botLevelTarget(),levels=0;while(S.botLevel<target&&levels<2){let price=levelPrice(S.botLevel),reserve=S.difficulty==='easy'?5:0;if(S.botGold<price+reserve)break;S.botGold-=price;S.botLevel++;levels++}if(S.botLevel>oldLevel)botMakeOffers();else if(!S.botOffers?.length)botMakeOffers();let maxPurchases=S.difficulty==='hard'?3:S.difficulty==='normal'?2:1,purchases=0,rerolled=false,reserve=S.difficulty==='hard'?0:S.difficulty==='normal'?1:2;while(purchases<maxPurchases){let hasKing=S.black.some(p=>p.alive&&p.kind==='k'&&p.isRoyal),choices=S.botOffers.map((offer,index)=>({offer,index})).filter(x=>x.offer&&x.offer.price+reserve<=S.botGold&&!(hasKing&&x.offer.kind==='k'));choices.sort((a,b)=>((BASE[b.offer.kind]||0)/b.offer.price)-((BASE[a.offer.kind]||0)/a.offer.price));if(!choices.length){if(!rerolled&&S.botGold>=5&&S.difficulty!=='easy'){S.botGold-=2;S.botOfferSeed+=19;botMakeOffers();rerolled=true;continue}break}let{offer,index}=choices[0];S.botGold-=offer.price;let id=`bA${S.botNextUnit++}`,royal=offer.kind==='k'&&!hasKing,p=unit(id,'b',offer.kind,0,0,{inField:false,isRoyal:royal});S.black.push(p);S.botOffers[index]=null;botAutoFuse(p);purchases++}botPlaceBench();if(S.botLevel>oldLevel)S.botPreMovesRemaining+=S.botLevel-oldLevel;syncBotBoard()}
function settleBotRound(playerOutcome){let base=5,earned=(playerOutcome==='loss'?4:playerOutcome==='draw'?2:0)+S.botRoundEarned,interest=Math.min(5,Math.floor(S.botGold/10));S.botGold+=base+earned+interest;S.botSettlement={base,earned,interest,total:base+earned+interest};S.botRoundEarned=0;S.botGoodStreak=0}
function botMoveReward(moves,chosen){let scores=moves.map(m=>-staticEval(applyMove(S.board,m))),best=Math.max(...scores),actual=-staticEval(applyMove(S.board,chosen)),regret=Math.max(0,best-actual);if(regret<=.05){S.botGoodStreak++;let pay=2;if(S.botGoodStreak%2===0)pay++;return pay}if(regret<=.9){S.botGoodStreak++;return S.botGoodStreak%2===0?2:1}S.botGoodStreak=0;return 0}
const endRoundBeforeBotPrep=endRound;
endRound=function(outcome,reason){let single=S.gameMode==='single';endRoundBeforeBotPrep(outcome,reason);if(!single||S.mode!=='prep')return;settleBotRound(outcome);S.botPreMovesRemaining=S.botLevel;S.prepLastMover=null;botMakeOffers();botPrepare();S.side='w';render()};
const buyLevelBeforeBotPrep=buyLevel;
buyLevel=function(){let old=S.level;buyLevelBeforeBotPrep();if(S.level!==old){botPrepare();render()}};
const botPlayPrepMove=function(record){let moved=0;while(S.botPreMovesRemaining>0&&(moved===0||S.preMovesRemaining===0)){let moves=legalMoves(S.board,'b').filter(m=>!S.board[m.ty][m.tx]&&!m.ep&&!m.castle&&!m.kingSwap&&!m.fortify&&!m.abduct);if(!moves.length)break;let move=chooseBotMove(moves);let piece=S.board[move.fy][move.fx];if(piece&&!record.pieces.some(p=>p.id===piece.id))record.pieces.push(copyPiece(piece));let reward=botMoveReward(moves,move),result=applyLiveMove(move);S.botPreMovesRemaining--;moved++;S.prepLastMover='b';S.botRoundEarned+=reward;S.log.push({round:S.round,turn:moved,move:result.label,color:'b',quality:'엔진 준비 수',bad:false,score:staticEval(S.board),regret:null})}return moved};
playPrepMove=function(move){if(S.mode!=='prep'||S.preMovesRemaining<=0||S.side!=='w')return;let from=S.board[move.fy][move.fx];if(!from||from.color!=='w'||S.board[move.ty][move.tx]||move.ep||move.kingSwap||move.fortify)return;let changed=[from];if(move.castle){let rook=S.board[move.fy][move.castle==='k'?7:0];if(rook)changed.push(rook)}let record={pieces:changed.map(copyPiece),ep:S.board.ep?{...S.board.ep}:null,lastMove:S.lastMove?{...S.lastMove}:null,halfmoveClock:S.halfmoveClock,logLength:S.log.length,botMovesUsed:S.botLevel-S.botPreMovesRemaining,side:S.side,lastMover:S.prepLastMover};S.prepMoveUndo.push(record);let result=applyLiveMove(move);S.preMovesRemaining--;S.prepLastMover='w';S.selected=null;S.legal=[];S.log.push({round:S.round,turn:S.level-S.preMovesRemaining,move:result.label,color:'w',quality:'정비 선행 수',bad:false,score:staticEval(S.board),regret:null});let botMoved=botPlayPrepMove(record);if(S.preMovesRemaining>0)S.side='w';else S.side=botMoved?'w':'b';S.statusText=S.preMovesRemaining?`정비 선행 수 저장 · ${S.preMovesRemaining}수 남음 · 엔진도 준비 수를 두었습니다.`:'선행 수를 모두 사용했습니다. 마지막 수를 되돌릴 수 있습니다.';render()};
undoPrepMove=function(){if(S.mode!=='prep'||!S.prepMoveUndo.length)return;let previous=S.prepMoveUndo[S.prepMoveUndo.length-1],ids=new Set(previous.pieces.map(p=>p.id)),next=cloneBoard(S.board);for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(next[y][x]&&ids.has(next[y][x].id))next[y][x]=null;let armies=S.white.concat(S.black),restorable=previous.pieces.filter(saved=>armies.some(p=>p.id===saved.id&&p.alive&&p.inField));if(restorable.some(saved=>next[saved.y]?.[saved.x])){toast('되돌릴 칸이 다른 기물로 막혀 있습니다.');return}for(const saved of restorable){let current=armies.find(p=>p.id===saved.id);Object.assign(current,copyPiece(saved));next[saved.y][saved.x]=current}next.ep=previous.ep?{...previous.ep}:null;S.board=next;S.prepMoveUndo.pop();S.side='w';S.prepLastMover=previous.lastMover;S.lastMove=previous.lastMove;S.halfmoveClock=previous.halfmoveClock;S.log.length=previous.logLength;S.preMovesRemaining=Math.max(0,S.level-S.prepMoveUndo.length);S.botPreMovesRemaining=Math.max(0,S.botLevel-previous.botMovesUsed);S.selected=null;S.legal=[];S.statusText=`정비 선행 수를 되돌렸습니다. ${S.preMovesRemaining}수 남음`;render()};
openNextRound=function(){if(S.mode!=='prep')return;if(S.pendingAbilityUnits.length){toast('★3 특수 능력을 먼저 선택하세요.');return}if(!hasFieldKing()){S.statusText='라운드를 시작하려면 내 킹 1개를 필드에 배치해야 합니다.';toast('킹을 필드에 배치해야 라운드를 시작할 수 있습니다.');render();return}if(fieldCost()>fieldCap()){toast('필드 코스트를 한도 안으로 맞춰주세요.');return}if(S.round>=4)return;let startingSide=S.prepLastMover==='w'?'b':'w';S.round++;S.stageMoves=0;S.roundEarned=0;S.finish=null;S.mode='battle';S.side=startingSide;S.preMovesRemaining=0;S.botPreMovesRemaining=0;S.prepMoveUndo=[];S.prepLastMover=null;S.pendingExtra=null;S.abilityMode=null;S.selected=null;S.legal=[];S.statusText=startingSide==='b'?'정비 중 미리 둔 포지션에서 엔진이 먼저 둡니다.':'';S.halfmoveClock=0;S.positionCounts={};recordPosition();refreshEval();if(finishByRules()){render();return}render();toast(`${PHASES[S.round-1]} 시작`);if(S.side==='b')setTimeout(botTurn,220)};
const botRenderBeforePanel=render;
render=function(){botRenderBeforePanel();if(S.gameMode==='single'&&S.mode==='prep'&&S.botLevel){let deployed=S.black.filter(p=>p.alive&&p.inField).length;$('boardSub').textContent=`상대 엔진 정비 · 레벨 ${S.botLevel} · 필드 ${botArmyCost()}/${botFieldCap()} · ${deployed}기 배치`;}};

const endRoundBeforeSealedPrep=endRound;
endRound=function(outcome,reason){if(S.mode!=='battle')return;let single=S.gameMode==='single',offerSeedBefore=S.offerSeed;endRoundBeforeSealedPrep(outcome,reason);if(!single||S.mode!=='prep')return;if(S.offerSeed===offerSeedBefore)freshOffers();S.botPrepBoard=cloneBoard(S.board);S.side='w';render()};

function playHiddenBotPrepMoves(record){if(!S.botPrepBoard)S.botPrepBoard=cloneBoard(S.board);let visibleBoard=S.board,moved=0;S.board=S.botPrepBoard;try{while(S.botPreMovesRemaining>0&&(moved===0||S.preMovesRemaining===0)){let moves=legalMoves(S.board,'b').filter(m=>!S.board[m.ty][m.tx]&&!m.ep&&!m.castle&&!m.kingSwap&&!m.fortify&&!m.abduct);if(!moves.length)break;let move=chooseBotMove(moves),before=S.board,label=moveLabel(move,before),reward=botMoveReward(moves,move);S.board=applyMove(before,move);S.botPreMovesRemaining--;moved++;S.botRoundEarned+=reward;S.log.push({round:S.round,turn:moved,move:label,color:'b',quality:'엔진 준비 수',bad:false,score:staticEval(S.board),regret:null,prepHidden:true})}S.botPrepBoard=S.board}finally{S.board=visibleBoard}return moved}

playPrepMove=function(move){if(S.mode!=='prep'||S.preMovesRemaining<=0||S.side!=='w')return;let from=S.board[move.fy][move.fx];if(!from||from.color!=='w'||S.board[move.ty][move.tx]||move.ep||move.kingSwap||move.fortify)return;if(!S.botPrepBoard)S.botPrepBoard=cloneBoard(S.board);let changed=[from];if(move.castle){let rook=S.board[move.fy][move.castle==='k'?7:0];if(rook)changed.push(rook)}let record={pieces:changed.map(copyPiece),ep:S.board.ep?{...S.board.ep}:null,lastMove:S.lastMove?{...S.lastMove}:null,halfmoveClock:S.halfmoveClock,logLength:S.log.length,botMovesUsed:S.botLevel-S.botPreMovesRemaining,botPrepBoardBefore:cloneBoard(S.botPrepBoard),lastMover:S.prepLastMover};S.prepMoveUndo.push(record);let result=applyLiveMove(move);S.preMovesRemaining--;S.prepLastMover='w';S.selected=null;S.legal=[];S.log.push({round:S.round,turn:S.level-S.preMovesRemaining,move:result.label,color:'w',quality:'정비 선행 수',bad:false,score:staticEval(S.board),regret:null});playHiddenBotPrepMoves(record);S.side='w';S.statusText=S.preMovesRemaining?`정비 선행 수 저장 · ${S.preMovesRemaining}수 남음 · 마지막 수 되돌리기 가능`:'선행 수를 모두 사용했습니다. 마지막 수를 되돌릴 수 있습니다.';render()};

undoPrepMove=function(){if(S.mode!=='prep'||!S.prepMoveUndo.length)return;let previous=S.prepMoveUndo[S.prepMoveUndo.length-1],ids=new Set(previous.pieces.map(p=>p.id)),next=cloneBoard(S.board);for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(next[y][x]&&ids.has(next[y][x].id))next[y][x]=null;let armies=S.white.concat(S.black),restorable=previous.pieces.filter(saved=>armies.some(p=>p.id===saved.id&&p.alive&&p.inField));if(restorable.some(saved=>next[saved.y]?.[saved.x])){toast('되돌릴 칸이 다른 기물로 막혀 있습니다.');return}for(const saved of restorable){let current=armies.find(p=>p.id===saved.id);Object.assign(current,copyPiece(saved));next[saved.y][saved.x]=current}next.ep=previous.ep?{...previous.ep}:null;S.board=next;S.prepMoveUndo.pop();S.botPrepBoard=previous.botPrepBoardBefore?cloneBoard(previous.botPrepBoardBefore):cloneBoard(S.board);S.side='w';S.prepLastMover=previous.lastMover;S.lastMove=previous.lastMove;S.halfmoveClock=previous.halfmoveClock;S.log.length=previous.logLength;S.preMovesRemaining=Math.max(0,S.level-S.prepMoveUndo.length);S.botPreMovesRemaining=Math.max(0,S.botLevel-previous.botMovesUsed);S.selected=null;S.legal=[];S.statusText=`정비 선행 수를 되돌렸습니다. ${S.preMovesRemaining}수 남음`;render()};

function mergeSealedPrepBoards(){let humanBoard=S.board,opponentBoard=S.botPrepBoard||S.board,merged=Array.from({length:8},()=>Array(8).fill(null));for(const p of humanBoard.flat())if(p?.color==='w')merged[p.y][p.x]=copyPiece(p);let collisions=0;for(const source of opponentBoard.flat()){if(!source||source.color!=='b')continue;let p=copyPiece(source),x=p.x,y=p.y;if(merged[y][x]){collisions++;let home=p.home;if(!merged[home.y]?.[home.x]){x=home.x;y=home.y}else{let slot=null;for(let yy=7;yy>=4&&!slot;yy--)for(let xx=0;xx<8;xx++)if(!merged[yy][xx]){slot=[xx,yy];break}if(!slot)for(let yy=0;yy<8&&!slot;yy++)for(let xx=0;xx<8;xx++)if(!merged[yy][xx]){slot=[xx,yy];break}if(!slot)continue;[x,y]=slot}}p.x=x;p.y=y;merged[y][x]=p}merged.ep=opponentBoard.ep?{...opponentBoard.ep}:null;S.board=merged;writeBack(merged);S.botPrepBoard=null;return collisions}

const buyLevelBeforeSealedPrep=buyLevelBeforeBotPrep;
buyLevel=function(){let old=S.level;buyLevelBeforeSealedPrep();if(S.level!==old&&S.mode==='prep'&&S.gameMode==='single'&&!S.prepMoveUndo.length&&S.botPreMovesRemaining===S.botLevel){botPrepare();S.botPrepBoard=cloneBoard(S.board);render()}};

openNextRound=function(){if(S.mode!=='prep')return;if(S.pendingAbilityUnits.length){toast('★3 특수 능력을 먼저 선택하세요.');return}if(!hasFieldKing()){S.statusText='라운드를 시작하려면 내 킹 1개를 필드에 배치해야 합니다.';toast('킹을 필드에 배치해야 라운드를 시작할 수 있습니다.');render();return}if(fieldCost()>fieldCap()){toast('필드 코스트를 한도 안으로 맞춰주세요.');return}if(S.round>=4)return;let collisions=mergeSealedPrepBoards(),startingSide=S.playerColor==='w'?'w':'b';S.round++;S.stageMoves=0;S.roundEarned=0;S.finish=null;S.mode='battle';S.side=startingSide;S.preMovesRemaining=0;S.botPreMovesRemaining=0;S.prepMoveUndo=[];S.prepLastMover=null;S.pendingExtra=null;S.abilityMode=null;S.selected=null;S.legal=[];S.statusText=collisions?`${collisions}개 준비 수가 같은 칸을 선택해 엔진 수를 원래 칸으로 돌렸습니다.`:'';S.lastMove=null;S.halfmoveClock=0;S.positionCounts={};recordPosition();refreshEval();if(finishByRules()){render();return}render();toast(`${PHASES[S.round-1]} 시작 · 백 선공`);if(S.side==='b')setTimeout(botTurn,220)};

const newGameBeforeWhiteFirst=newGame;
newGame=function(difficulty='normal'){newGameBeforeWhiteFirst(difficulty);if(S.gameMode!=='single')return;S.side=S.playerColor==='w'?'w':'b';S.positionCounts={};recordPosition();render();if(S.side==='b')setTimeout(botTurn,220)};

const renderLogBeforeSealedPrep=renderLog;
renderLog=function(){if(S.gameMode==='single'&&S.mode==='prep'){let log=S.log;S.log=log.filter(entry=>!entry.prepHidden&&entry.quality!=='엔진 준비 수');try{renderLogBeforeSealedPrep()}finally{S.log=log}return}renderLogBeforeSealedPrep()};

S.board=makeBoard();freshOffers();recordPosition();render();showStartMenu();

// Sealed maintenance: the player may only rearrange same-kind core pieces on
// their original starting squares. Empty-square setup moves are not allowed.
function standardDeploymentSquares(kind,color='w'){
  const back=color==='w'?0:7,pawn=color==='w'?1:6;
  if(kind==='p')return Array.from({length:8},(_,x)=>({x,y:pawn}));
  if(kind==='r')return[{x:0,y:back},{x:7,y:back}];
  if(kind==='n')return[{x:1,y:back},{x:6,y:back}];
  if(kind==='b')return[{x:2,y:back},{x:5,y:back}];
  if(kind==='q')return[{x:3,y:back}];
  if(kind==='k')return[{x:4,y:back}];
  return[];
}
coreHomeSquares=function(piece){
  if(!piece)return[];
  if(piece.kind==='q'||piece.kind==='k')return[piece.origin||piece.home];
  return standardDeploymentSquares(piece.kind,piece.color);
};
isCoreHomeSquare=function(piece,x,y){
  const homes=piece?.isCore?coreHomeSquares(piece):standardDeploymentSquares(piece?.kind,piece?.color);
  return homes.some(square=>square.x===x&&square.y===y);
};
deploySelected=function(x,y){
  const p=S.white.find(unit=>unit.id===S.selected);
  if(!p||!p.alive||p.inField)return false;
  if(!standardDeploymentSquares(p.kind,'w').some(square=>square.x===x&&square.y===y)){
    toast(`${NAME[p.kind]}은(는) 기본 시작 칸에만 배치할 수 있습니다.`);return false;
  }
  if(p.isCore&&!isCoreHomeSquare(p,x,y)){
    toast('기본 기물은 원래 종류의 시작 칸에만 배치할 수 있습니다.');return false;
  }
  if(fieldCost()+cost(p)>fieldCap()){toast('필드 코스트 한도 초과');return false;}
  if(S.board[y][x]){toast('해당 기본 시작 칸이 이미 사용 중입니다.');return false;}
  p.inField=true;p.x=x;p.y=y;p.home={x,y};S.board[y][x]=p;S.formation='custom';return true;
};
function prepSwapMovesFrom(unitId,color='w'){
  const piece=S.board.flat().find(candidate=>candidate?.id===unitId);
  const isCore=unit=>unit?.isCore||(color==='b'&&botCoreId(unit?.id));
  if(!isCore(piece)||piece.color!==color||['q','k'].includes(piece.kind))return[];
  const homes=standardDeploymentSquares(piece.kind,color),moves=[];
  for(const square of homes){
    if(square.x===piece.x&&square.y===piece.y)continue;
    const target=S.board[square.y][square.x];
    if(isCore(target)&&target.color===color&&target.kind===piece.kind)
      moves.push({fx:piece.x,fy:piece.y,tx:square.x,ty:square.y,prepHome:true});
  }
  return moves;
}
prepMovesFrom=function(unitId){return prepSwapMovesFrom(unitId,'w')};
prepRestrictedMovesFrom=function(unitId){return prepSwapMovesFrom(unitId,'w')};
const writeBackBeforeSealedMaintenance=writeBack;
writeBack=function(board){
  const hasOpponent=board.some(row=>row.some(piece=>piece?.color==='b'));
  if(S.gameMode==='single'&&S.mode==='prep'&&!hasOpponent){
    for(const piece of S.white){
      if(!piece.alive)continue;
      let found=null;
      for(let y=0;y<8&&!found;y++)for(let x=0;x<8;x++)if(board[y][x]?.id===piece.id){found=board[y][x];break;}
      if(found){Object.assign(piece,copyPiece(found));piece.inField=true;}
      else if(piece.inField){piece.inField=false;}
    }
    return;
  }
  writeBackBeforeSealedMaintenance(board);
};
function swapPrepPieces(board,move){
  const first=board[move.fy][move.fx],second=board[move.ty][move.tx];
  if(!first||!second)return null;
  board[move.fy][move.fx]=second;board[move.ty][move.tx]=first;
  first.x=move.tx;first.y=move.ty;first.home={x:move.tx,y:move.ty};
  second.x=move.fx;second.y=move.fy;second.home={x:move.fx,y:move.fy};
  return `${icon(first.kind,first.color)} ${coord(move.fx,move.fy)}↔${coord(move.tx,move.ty)}`;
}
playHiddenBotPrepMoves=function(record){
  if(!S.botPrepBoard)S.botPrepBoard=makeBoard();
  const visibleBoard=S.board;let moved=0;
  S.board=S.botPrepBoard;
  try{
    while(S.botPreMovesRemaining>0&&(moved===0||S.preMovesRemaining===0)){
      const moves=S.board.flat().filter(piece=>piece?.color==='b'&&botCoreId(piece.id)&&!['q','k'].includes(piece.kind))
        .flatMap(piece=>prepSwapMovesFrom(piece.id,'b'));
      if(!moves.length)break;
      const move=moves[(S.botOfferSeed+moved)%moves.length],label=swapPrepPieces(S.board,move);
      S.botPreMovesRemaining--;moved++;
      S.log.push({round:S.round,turn:moved,move:label,color:'b',quality:'엔진 준비 수',bad:false,score:staticEval(S.board),regret:null,prepHidden:true});
    }
    S.botPrepBoard=S.board;
  }finally{S.board=visibleBoard;}
  return moved;
};
playPrepMove=function(move){
  if(S.mode!=='prep'||S.preMovesRemaining<=0||S.side!=='w')return;
  const from=S.board[move.fy]?.[move.fx],to=S.board[move.ty]?.[move.tx];
  if(!from?.isCore||from.color!=='w'||!to?.isCore||to.color!=='w'||from.kind!==to.kind||['q','k'].includes(from.kind)||!isCoreHomeSquare(from,move.tx,move.ty)||!isCoreHomeSquare(to,move.fx,move.fy)){
    toast('선행 수는 같은 종류 기본 기물의 시작 칸 교환만 가능합니다.');return;
  }
  if(!S.botPrepBoard)S.botPrepBoard=makeBoard();
  const label=`${icon(from.kind,'w')} ${coord(move.fx,move.fy)}↔${coord(move.tx,move.ty)}`;
  const record={pieces:[copyPiece(from),copyPiece(to)],ep:S.board.ep?{...S.board.ep}:null,lastMove:S.lastMove?{...S.lastMove}:null,halfmoveClock:S.halfmoveClock,logLength:S.log.length,botMovesUsed:S.botLevel-S.botPreMovesRemaining,botPrepBoardBefore:cloneBoard(S.botPrepBoard),lastMover:S.prepLastMover};
  S.prepMoveUndo.push(record);swapPrepPieces(S.board,move);writeBack(S.board);S.preMovesRemaining--;S.prepLastMover='w';S.selected=null;S.legal=[];
  S.log.push({round:S.round,turn:S.level-S.preMovesRemaining,move:label,color:'w',quality:'정비 선행 수',bad:false,score:staticEval(S.board),regret:null});
  playHiddenBotPrepMoves(record);S.side='w';
  S.statusText=S.preMovesRemaining?`정비 선행 수 교환 · ${S.preMovesRemaining}회 남음 · 마지막 교환 되돌리기 가능`:'정비 선행 수를 모두 사용했습니다. 마지막 교환을 되돌릴 수 있습니다.';
  render();
};
const sealedClickSquare=clickSquare;
clickSquare=function(x,y){
  if(S.mode==='prep'&&S.preMovesRemaining>0&&S.side==='w'&&S.selected){
    const selected=typeof S.selected==='string'?S.white.find(piece=>piece.id===S.selected):null;
    if(selected?.inField&&!S.board[y][x]){toast('정비 선행 수는 빈칸 이동에 사용할 수 없습니다. 같은 종류의 기본 기물끼리만 교환하세요.');return;}
  }
  sealedClickSquare(x,y);
};
const buyLevelBeforeHiddenPrep=buyLevelBeforeBotPrep;
buyLevel=function(){
  const oldLevel=S.level;
  buyLevelBeforeHiddenPrep();
  if(S.level===oldLevel||S.mode!=='prep'||S.gameMode!=='single')return;
  const visibleBoard=S.board;S.board=cloneBoard(S.botPrepBoard||makeBoard());
  botPrepare();S.botPrepBoard=cloneBoard(S.board);S.board=visibleBoard;
  S.statusText=`정비 선행 수 ${S.preMovesRemaining}/${S.level}회는 같은 종류 기본 기물의 시작 칸 교환에만 사용할 수 있습니다.`;render();
};
endRound=function(outcome,reason){
  if(S.mode!=='battle')return;
  const single=S.gameMode==='single';
  if(!single){endRoundBeforeBotPrep(outcome,reason);return;}
  endRoundBeforeBotPrep(outcome,reason);
  if(S.mode!=='prep')return;
  settleBotRound(outcome);S.botPreMovesRemaining=S.botLevel;S.prepLastMover=null;botMakeOffers();
  const visibleBoard=S.board;
  S.board=cloneBoard(visibleBoard);
  botPrepare();S.botPrepBoard=cloneBoard(S.board);
  const playerBoard=cloneBoard(visibleBoard);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(playerBoard[y][x]?.color==='b')playerBoard[y][x]=null;
  S.board=playerBoard;S.side='w';S.statusText=`정비 선행 수 ${S.preMovesRemaining}/${S.level}회는 같은 종류 기본 기물의 시작 칸 교환에만 사용할 수 있습니다.`;render();
};
const sealedBotPlaceBenchBeforeRule=botPlaceBench;
botPlaceBench=function(){
  if(S.gameMode!=='single'||S.mode!=='prep'){sealedBotPlaceBenchBeforeRule();return;}
  const candidates=S.black.filter(piece=>piece.alive&&!piece.inField&&!botCoreId(piece.id)&&(piece.id.startsWith('bA')||piece.id.startsWith('bF'))).sort((a,b)=>botPieceValue(b)-botPieceValue(a));
  for(const piece of candidates){
    const homes=standardDeploymentSquares(piece.kind,'b').filter(square=>square.y>=8-botRows());
    let slot=homes.find(square=>!S.board[square.y][square.x]),victim=null;
    if(!slot){
      const occupied=homes.map(square=>({square,piece:S.board[square.y][square.x]})).filter(entry=>entry.piece?.color==='b'&&!entry.piece.isRoyal);
      occupied.sort((a,b)=>botPieceValue(a.piece)-botPieceValue(b.piece));
      const replace=occupied.find(entry=>botPieceValue(piece)>botPieceValue(entry.piece));
      if(replace){slot=replace.square;victim=replace.piece;}
    }
    if(!slot)continue;
    const total=botArmyCost()-(victim?cost(victim):0)+cost(piece);
    if(total>botFieldCap())continue;
    if(victim){victim.inField=false;S.board[slot.y][slot.x]=null;}
    piece.inField=true;piece.x=slot.x;piece.y=slot.y;piece.home={x:slot.x,y:slot.y};piece.origin={x:slot.x,y:slot.y};
    S.board[slot.y][slot.x]=copyPiece(piece);
  }
};
function chessComPieceUrl(kind,color){
  if(!['p','n','b','r','q','k'].includes(kind))return null;
  return `https://images.chesscomfiles.com/chess-themes/pieces/neo/300/${color}${kind}.png`;
}
function putPieceArtwork(container,kind,color){
  const src=chessComPieceUrl(kind,color);if(!src)return false;
  const img=document.createElement('img');img.src=src;img.alt=`${color==='w'?'백':'흑'} ${NAME[kind]||kind}`;img.draggable=false;img.decoding='async';
  img.onerror=()=>{img.remove();container.textContent=icon(kind,color);};
  container.replaceChildren(img);return true;
}
const boardBeforeChessArtwork=renderBoard;
renderBoard=function(){
  boardBeforeChessArtwork();
  const board=$('board');
  for(const cell of board.children){
    const square=squareIndex(cell.getAttribute('aria-label')),piece=S.board?.[square.y]?.[square.x];
    if(S.gameMode==='single'&&S.mode==='prep'&&piece?.color==='b'){cell.replaceChildren();continue;}
    const glyph=cell.querySelector('.piece');if(glyph&&piece)putPieceArtwork(glyph,piece.kind,piece.color);
  }
};
const boardBeforeShopArtwork=renderOffers;
renderOffers=function(){
  boardBeforeShopArtwork();
  for(const [index,element] of [...$('offers').children].entries()){
    const offer=S.offers[index];if(offer){const glyph=element.querySelector('.glyph');if(glyph)putPieceArtwork(glyph,offer.kind,'w');}
  }
};
const benchBeforeChessArtwork=renderBench;
renderBench=function(){
  benchBeforeChessArtwork();
  const bench=S.white.filter(piece=>piece.alive&&!piece.inField);
  [...$('benchList').children].forEach((element,index)=>{
    const piece=bench[index],glyph=element.querySelector('.uniticon');
    if(glyph&&piece)putPieceArtwork(glyph,piece.kind,'w');
  });
};
function renderRevealedOpponentRoster(){
  const panel=$('opponentRoster');if(!panel)return;
  if(S.gameMode!=='single'||!['battle','finished'].includes(S.mode)){panel.hidden=true;panel.replaceChildren();return;}
  panel.hidden=false;panel.replaceChildren();
  const title=document.createElement('b');title.textContent=`상대 엔진 레벨 ${S.botLevel} · 필드 ${botArmyCost()}/${botFieldCap()} · 대기석`;panel.append(title);
  const bench=S.black.filter(piece=>piece.alive&&!piece.inField);
  if(!bench.length){const empty=document.createElement('span');empty.className='empty-note';empty.textContent='비어 있음';panel.append(empty);return;}
  for(const piece of bench){
    const chip=document.createElement('span');chip.className='opponent-chip';
    const glyph=document.createElement('span');glyph.className='opponent-icon';putPieceArtwork(glyph,piece.kind,'b');
    chip.append(glyph,document.createTextNode(`${NAME[piece.kind]} ★${piece.star}`));panel.append(chip);
  }
}
const sealedRenderBeforeRoster=render;
render=function(){
  sealedRenderBeforeRoster();
  if(S.gameMode==='single'&&S.mode==='prep')$('boardSub').textContent='상대의 구매·배치·승급과 정비 수는 라운드 시작 때 공개됩니다.';
  renderRevealedOpponentRoster();
  if(S.gameMode==='single'&&S.mode==='prep')$('levelNote').textContent=`필드 ${fieldCap()} · 배치 ${deploymentRows()}행 · 기본 시작 칸 배치 · 선행 교환 ${S.preMovesRemaining}/${S.level}`;
};
render();

// Free chess-legal setup moves; one level move is spent only for a custom
// relocation/swap that would not be legal in an ordinary chess position.
function legalPrepMovesFrom(unitId){
  return legalMoves(S.board,'w',unitId).filter(move=>!S.board[move.ty][move.tx]&&!move.ep&&!move.kingSwap&&!move.fortify&&!move.abduct&&!move.cannon);
}
prepMovesFrom=function(unitId){
  const piece=S.board.flat().find(candidate=>candidate?.id===unitId);if(!piece||piece.color!=='w')return[];
  const moves=[];
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)if((x!==piece.x||y!==piece.y)&&(!S.board[y][x]||S.board[y][x].color==='w'))moves.push({fx:piece.x,fy:piece.y,tx:x,ty:y,prepSetup:true});
  return moves;
};
prepRestrictedMovesFrom=function(unitId){return legalPrepMovesFrom(unitId)};
function prepMoveSnapshot(pieces){return{pieces:pieces.filter(Boolean).map(copyPiece),ep:S.board.ep?{...S.board.ep}:null,lastMove:S.lastMove?{...S.lastMove}:null,logLength:S.log.length,preMovesRemainingBefore:S.preMovesRemaining,botPreMovesRemainingBefore:S.botPreMovesRemaining,botPrepBoardBefore:S.botPrepBoard?cloneBoard(S.botPrepBoard):null,lastMover:S.prepLastMover}}
function syncPrepHomes(){for(const piece of S.board.flat())if(piece?.color==='w')piece.home={x:piece.x,y:piece.y};S.board.ep=null;writeBack(S.board)}
function executePrepMove(move){
  if(S.mode!=='prep'||S.side!=='w')return false;
  const from=S.board[move.fy]?.[move.fx];if(!from||from.color!=='w')return false;
  const target=S.board[move.ty]?.[move.tx],legal=legalPrepMovesFrom(from.id).find(candidate=>candidate.tx===move.tx&&candidate.ty===move.ty);
  let record,description,paid=false;
  if(legal){
    let changed=[from];if(legal.castle){const rook=S.board[legal.fy][legal.castle==='k'?7:0];if(rook)changed.push(rook)}
    record=prepMoveSnapshot(changed);description=moveLabel(legal,S.board);S.board=applyMove(S.board,legal);syncPrepHomes();
  }else{
    if(S.preMovesRemaining<=0){toast('합법 이동은 무료입니다. 다른 이동에는 남은 선행 수가 필요합니다.');return false;}
    if(target&&target.color!=='w'){toast('상대 기물은 정비 중 보이지 않으며 이동 대상으로 삼을 수 없습니다.');return false;}
    record=prepMoveSnapshot(target?[from,target]:[from]);paid=true;
    if(target){S.board[move.fy][move.fx]=target;S.board[move.ty][move.tx]=from;target.x=move.fx;target.y=move.fy;target.home={x:move.fx,y:move.fy};target.hasMoved=true;description=`${icon(from.kind,'w')} ${coord(move.fx,move.fy)}↔${coord(move.tx,move.ty)}`}
    else{S.board[move.fy][move.fx]=null;S.board[move.ty][move.tx]=from;from.x=move.tx;from.y=move.ty;from.home={x:move.tx,y:move.ty};from.hasMoved=true;description=`${icon(from.kind,'w')} ${coord(move.fx,move.fy)}⇢${coord(move.tx,move.ty)}`}
    S.preMovesRemaining--;syncPrepHomes();
  }
  S.prepMoveUndo.push(record);S.prepLastMover='w';S.selected=null;S.legal=[];
  S.log.push({round:S.round,turn:S.level-S.preMovesRemaining,move:description,color:'w',quality:paid?'정비 선행 수':'정비 무료 이동',bad:false,score:staticEval(S.board),regret:null});
  playHiddenBotPrepMoves(record);S.side='w';S.statusText=`정비 선행 수 ${S.preMovesRemaining}/${S.level} · 합법 이동은 무료, 그 외 이동은 1회 차감`;render();return true;
}
playPrepMove=function(move){executePrepMove(move)};
playHiddenBotPrepMoves=function(record){
  if(!S.botPrepBoard)S.botPrepBoard=makeBoard();const visibleBoard=S.board;let label=null;S.board=S.botPrepBoard;
  try{const moves=legalMoves(S.board,'b').filter(move=>!S.board[move.ty][move.tx]&&!move.ep&&!move.kingSwap&&!move.fortify&&!move.abduct&&!move.cannon);if(moves.length){const move=chooseBotMove(moves);label=moveLabel(move,S.board);S.board=applyMove(S.board,move);for(const piece of S.board.flat())if(piece?.color==='b')piece.home={x:piece.x,y:piece.y};S.log.push({round:S.round,turn:1,move:label,color:'b',quality:'엔진 준비 수',bad:false,score:staticEval(S.board),regret:null,prepHidden:true})}S.botPrepBoard=S.board}finally{S.board=visibleBoard}return label?1:0;
};
const clickBeforeMoveAllowanceRule=clickSquare;
clickSquare=function(x,y){
  if(S.mode!=='prep'){clickBeforeMoveAllowanceRule(x,y);return;}
  const target=S.board[y][x],selected=typeof S.selected==='string'?S.white.find(piece=>piece.id===S.selected):null;
  if(selected&&!selected.inField){if(target){toast('기물을 놓을 기본 시작 칸을 선택하세요.');return}if(deploySelected(x,y)){S.selected=null;S.legal=[];render()}return;}
  if(selected?.inField){
    const piece=S.board.flat().find(candidate=>candidate?.id===selected.id);if(!piece){S.selected=null;S.legal=[];render();return;}
    if(piece.x===x&&piece.y===y){S.selected=null;S.legal=[];render();return;}
    const legal=legalPrepMovesFrom(piece.id).find(move=>move.tx===x&&move.ty===y);if(legal){executePrepMove(legal);return;}
    if(S.preMovesRemaining>0&&(!target||target.color==='w')){executePrepMove({fx:piece.x,fy:piece.y,tx:x,ty:y});return;}
    if(target?.color==='w'){S.selected=target.id;S.legal=S.preMovesRemaining>0?prepMovesFrom(target.id):prepRestrictedMovesFrom(target.id);render();return;}
    toast('합법 이동은 무료이며, 그 외 이동에는 선행 수가 필요합니다.');return;
  }
  if(target?.color==='w'){S.selected=target.id;S.legal=S.preMovesRemaining>0?prepMovesFrom(target.id):prepRestrictedMovesFrom(target.id)}else{S.selected=null;S.legal=[]}render();
};
const moveBeforeAllowanceRule=moveSelected;
moveSelected=function(move){if(S.mode==='prep'){executePrepMove(move);return}moveBeforeAllowanceRule(move)};
undoPrepMove=function(){
  if(S.mode!=='prep'||!S.prepMoveUndo.length)return;
  const record=S.prepMoveUndo[S.prepMoveUndo.length-1],ids=new Set(record.pieces.map(piece=>piece.id)),next=cloneBoard(S.board);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(next[y][x]&&ids.has(next[y][x].id))next[y][x]=null;
  const restorable=record.pieces.filter(saved=>S.white.some(piece=>piece.id===saved.id&&piece.alive&&piece.inField));
  if(restorable.some(saved=>next[saved.y]?.[saved.x])){toast('되돌릴 칸이 다른 기물로 막혀 있습니다.');return;}
  for(const saved of restorable){const piece=S.white.find(candidate=>candidate.id===saved.id);Object.assign(piece,copyPiece(saved));next[saved.y][saved.x]=piece;}
  next.ep=record.ep?{...record.ep}:null;S.board=next;S.botPrepBoard=record.botPrepBoardBefore?cloneBoard(record.botPrepBoardBefore):S.botPrepBoard;
  S.prepMoveUndo.pop();S.preMovesRemaining=record.preMovesRemainingBefore;S.botPreMovesRemaining=record.botPreMovesRemainingBefore;S.prepLastMover=record.lastMover;S.lastMove=record.lastMove;S.log.length=record.logLength;S.selected=null;S.legal=[];
  S.statusText=`정비 선행 수 ${S.preMovesRemaining}/${S.level} · 이동을 되돌렸습니다.`;render();
};
function paintPrepCostTargets(){
  if(S.mode!=='prep')return;const board=$('board');for(const cell of board.children)cell.classList.remove('prep-cost','legal','capture');
  const piece=typeof S.selected==='string'?S.board.flat().find(candidate=>candidate?.id===S.selected):null;if(!piece)return;
  const legal=new Set(legalPrepMovesFrom(piece.id).map(move=>`${move.tx},${move.ty}`));
  for(const cell of board.children){const square=squareIndex(cell.getAttribute('aria-label')),target=S.board[square.y][square.x],key=`${square.x},${square.y}`;if(legal.has(key))cell.classList.add('legal');else if(S.preMovesRemaining>0&&(!target||target.color==='w')&&!(square.x===piece.x&&square.y===piece.y))cell.classList.add('prep-cost');}
}
const renderBoardBeforePrepCostTargets=renderBoard;
renderBoard=function(){renderBoardBeforePrepCostTargets();paintPrepCostTargets()};
document.addEventListener('pointermove',event=>{
  if(!activeDrag?.prep||!activeDrag.prepActivated)return;
  const board=$('board');for(const cell of board.children)cell.classList.remove('legal','capture','prep-cost');
  const piece=S.board.flat().find(candidate=>candidate?.id===activeDrag.pieceId);if(!piece)return;
  const legal=new Set(legalPrepMovesFrom(piece.id).map(move=>`${move.tx},${move.ty}`));
  for(const cell of board.children){const square=squareIndex(cell.getAttribute('aria-label')),target=S.board[square.y][square.x],key=`${square.x},${square.y}`;if(legal.has(key))cell.classList.add('legal');else if(S.preMovesRemaining>0&&(!target||target.color==='w')&&!(square.x===piece.x&&square.y===piece.y))cell.classList.add('prep-cost');}
});
const renderBeforeAllowanceNote=render;
render=function(){renderBeforeAllowanceNote();if(S.gameMode==='single'&&S.mode==='prep'){$('boardSub').textContent='상대의 정비 내용은 비공개입니다. 합법 이동은 무료이며, 그 외 이동은 선행 수를 사용합니다.';$('levelNote').textContent=`필드 ${fieldCap()} · 배치 ${deploymentRows()}행 · 기본 시작 칸 배치 · 비합법 이동 ${S.preMovesRemaining}/${S.level}`}};

const chessComSoundBase='https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/';
const chessComSoundFiles={move:'move-self.mp3',opponent:'move-opponent.mp3',capture:'capture.mp3',check:'move-check.mp3',end:'game-end.mp3',start:'game-start.mp3'};
const chessComAudioCache=new Map();
function playChessComSound(name){if(name==='checkmate'){playChessComSound('check');window.setTimeout(()=>playChessComSound('end'),260);return}const file=chessComSoundFiles[name];if(!file)return;let audio=chessComAudioCache.get(name);if(!audio){audio=new Audio(chessComSoundBase+file);audio.preload='auto';audio.volume=.62;chessComAudioCache.set(name,audio)}try{audio.currentTime=0;const playing=audio.play();if(playing?.catch)playing.catch(()=>{})}catch{}}
const applyLiveMoveBeforeChessComSound=applyLiveMove;
applyLiveMove=function(move){const board=S.board,moving=board[move.fy]?.[move.fx],target=board[move.ty]?.[move.tx],captured=!!(target||move.ep),result=applyLiveMoveBeforeChessComSound(move);if(moving&&['battle','roomBattle'].includes(S.mode)){const enemy=moving.color==='w'?'b':'w';if(isCheckmate(S.board,enemy))playChessComSound('checkmate');else if(inCheck(S.board,enemy))playChessComSound('check');else if(captured)playChessComSound('capture');else playChessComSound(moving.color===S.playerColor?'move':'opponent')}return result};
const openNextRoundBeforeChessComSound=openNextRound;
openNextRound=function(){const before=S.mode;openNextRoundBeforeChessComSound();if(before==='prep'&&S.mode==='battle')playChessComSound('start')};
const newGameBeforeChessComSound=newGame;
newGame=function(difficulty='normal'){newGameBeforeChessComSound(difficulty);if(S.gameMode==='single'&&S.mode==='battle')playChessComSound('start')};
const handleRoomMessageBeforeChessComSound=handleRoomMessage;
handleRoomMessage=function(message){const before=S.mode;handleRoomMessageBeforeChessComSound(message);if(message?.type==='start'&&before==='roomPrep'&&S.mode==='roomBattle')playChessComSound('start')};
