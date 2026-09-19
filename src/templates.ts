export type Template = {
  id: string
  name: string
  language: 'html' | 'python' | 'javascript' | 'dart'
  description: string
  code: string
  files?: { html: string; css: string; js: string }
}

export const TEMPLATES: Template[] = [
  {
    id: 'todo',
    name: 'Todo App',
    language: 'html',
    description: 'Tap to add & complete tasks',
    files: {
      html: `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="style.css">
</head><body>
  <div class="app">
    <h1>Todos</h1>
    <form id="f"><input id="in" placeholder="New task…" /><button>+</button></form>
    <ul id="list"></ul>
  </div>
  <script src="app.js"></script>
</body></html>`,
      css: `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, system-ui; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 24px 16px; }
.app { max-width: 360px; margin: 0 auto; }
h1 { font-size: 28px; margin-bottom: 16px; color: #34d399; }
form { display: flex; gap: 8px; margin-bottom: 16px; }
input { flex: 1; padding: 12px 14px; border-radius: 12px; border: 1px solid #334155; background: #1e293b; color: #fff; font-size: 16px; }
button { width: 48px; border: none; border-radius: 12px; background: #10b981; color: #fff; font-size: 22px; }
li { list-style: none; padding: 12px 14px; background: #1e293b; border-radius: 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
li.done span { text-decoration: line-through; opacity: 0.5; }
li input { width: 18px; height: 18px; }`,
      js: `const list = document.getElementById('list');
const form = document.getElementById('f');
const input = document.getElementById('in');
const todos = JSON.parse(localStorage.getItem('todos') || '[]');
function save() { localStorage.setItem('todos', JSON.stringify(todos)); render(); }
function render() {
  list.innerHTML = todos.map((t, i) =>
    \`<li class="\${t.done ? 'done' : ''}"><input type="checkbox" \${t.done ? 'checked' : ''} data-i="\${i}"/><span>\${t.text}</span></li>\`
  ).join('');
  list.querySelectorAll('input').forEach(cb => cb.onchange = () => {
    todos[+cb.dataset.i].done = cb.checked; save();
  });
}
form.onsubmit = e => {
  e.preventDefault();
  if (!input.value.trim()) return;
  todos.push({ text: input.value.trim(), done: false });
  input.value = '';
  save();
};
render();`,
    },
    code: '',
  },
  {
    id: 'calc',
    name: 'Calculator',
    language: 'html',
    description: 'Simple calculator UI',
    code: `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;background:#111;font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh}
.c{width:280px;background:#1c1c1e;border-radius:24px;padding:16px;box-shadow:0 20px 50px #000}
.d{height:72px;color:#fff;font-size:40px;text-align:right;padding:12px;overflow:hidden}
.g{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
button{height:56px;border:none;border-radius:50%;font-size:22px;background:#333;color:#fff}
button.op{background:#ff9f0a;color:#000}
button.eq{background:#30d158;color:#000}
button.wide{grid-column:span 2;border-radius:28px}
</style></head><body>
<div class="c"><div class="d" id="d">0</div>
<div class="g" id="g"></div></div>
<script>
const keys=['AC','±','%','÷','7','8','9','×','4','5','6','−','1','2','3','+','0','.','='];
const g=document.getElementById('g'),d=document.getElementById('d');
let cur='0',prev='',op='';
keys.forEach(k=>{
  const b=document.createElement('button');
  b.textContent=k;
  if('÷×−+'.includes(k))b.className='op';
  if(k==='=')b.className='eq';
  if(k==='0')b.className='wide';
  b.onclick=()=>{
    if(k==='AC'){cur='0';prev='';op='';}
    else if('÷×−+'.includes(k)){prev=cur;op=k;cur='0';}
    else if(k==='='){
      const a=+prev,b=+cur;
      if(op==='+')cur=String(a+b);
      if(op==='−')cur=String(a-b);
      if(op==='×')cur=String(a*b);
      if(op==='÷')cur=String(a/b);
      op='';prev='';
    } else if(k==='.'){if(!cur.includes('.'))cur+='.';}
    else if(k==='±')cur=String(-cur);
    else if(k==='%')cur=String(+cur/100);
    else cur=cur==='0'?k:cur+k;
    d.textContent=cur;
  };
  g.appendChild(b);
});
</script></body></html>`,
  },
  {
    id: 'weather',
    name: 'Weather Card',
    language: 'html',
    description: 'iOS-style weather widget',
    code: `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:linear-gradient(160deg,#1e3a5f,#0d1b2a);font-family:-apple-system,system-ui;color:#fff}
.card{width:min(320px,90vw);background:rgba(30,60,100,.75);backdrop-filter:blur(20px);
border-radius:24px;padding:24px;box-shadow:0 16px 40px rgba(0,0,0,.4)}
.loc{font-size:18px;opacity:.9}.temp{font-size:64px;font-weight:200;margin:8px 0}
.cond{opacity:.85}.hl{margin-top:12px;opacity:.7;font-size:14px}
</style></head><body>
<div class="card">
  <div class="loc">London</div>
  <div class="temp">11°</div>
  <div class="cond">Mostly Cloudy</div>
  <div class="hl">H:17° · L:10°</div>
</div>
</body></html>`,
  },
  {
    id: 'py-chart',
    name: 'Python squares',
    language: 'python',
    description: 'Lists & functions',
    code: `print("Python sandbox")
nums = list(range(1, 11))
print("Numbers:", nums)
print("Squares:", [n*n for n in nums])
print("Sum:", sum(nums))

def fib(n):
    a, b = 0, 1
    out = []
    for _ in range(n):
        out.append(a)
        a, b = b, a + b
    return out

print("Fibonacci(10):", fib(10))`,
  },
  {
    id: 'js-fetch',
    name: 'JS async demo',
    language: 'javascript',
    description: 'Promises & timers',
    code: `console.log("JS sandbox");

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log("Waiting 300ms…");
  await wait(300);
  console.log("Done!");
  const data = [1,2,3,4,5].map(n => n * n);
  console.log("Squares:", data);
})();`,
  },
  {
    id: 'dart-hello',
    name: 'Dart hello',
    language: 'dart',
    description: 'Basic Dart program',
    code: `void main() {
  print('Hello from Dart!');
  final nums = [1, 2, 3, 4, 5];
  print('Squares: \${nums.map((n) => n * n).toList()}');
  String greet(String name) => 'Hi, \$name!';
  print(greet('Developer'));
}`,
  },
]

TEMPLATES.forEach(t => {
  if (t.files && !t.code) {
    t.code = t.files.html
  }
})
