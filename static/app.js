"use strict";
// ================= Life OS frontend =================
// All data comes from the Flask API (see app.py). Modify freely.

var S = null;          // full app state from /api/state
var habitSet = {};     // "habitId|date" -> true

// ---------- helpers ----------
function z(n){ return (n<10?"0":"")+n; }
function toISO(d){ return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate()); }
function todayStr(){ return toISO(new Date()); }
function parseISO(s){ var p=s.split("-"); return new Date(+p[0],+p[1]-1,+p[2]); }
var DAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
var MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function weekDates(off){
  var now=new Date(), dow=(now.getDay()+6)%7;
  var mon=new Date(now.getFullYear(),now.getMonth(),now.getDate()-dow+off*7);
  var out=[]; for(var i=0;i<7;i++) out.push(new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+i));
  return out;
}
function daysUntil(iso){ return Math.round((parseISO(iso)-parseISO(todayStr()))/86400000); }
function fmtShort(d){ return DAYS[(d.getDay()+6)%7]+" "+d.getDate()+" "+MONTHS[d.getMonth()]; }
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function toast(msg){
  var t=document.createElement("div"); t.className="toast"; t.textContent=msg;
  document.body.appendChild(t); setTimeout(function(){t.remove();},2500);
}

async function api(method, path, body){
  var opt={method:method, headers:{"Content-Type":"application/json"}};
  if(body!==undefined) opt.body=JSON.stringify(body);
  var r=await fetch(path,opt);
  if(!r.ok){ var e=await r.json().catch(function(){return{error:r.statusText};}); throw new Error(e.error||"request failed"); }
  return r.json();
}
var SET=null;   // user settings from /api/settings
async function refresh(){
  S = await api("GET","/api/state");
  SET = await api("GET","/api/settings");
  habitSet={};
  S.habit_log.forEach(function(l){ habitSet[l.habit_id+"|"+l.date]=true; });
  renderAll();
}

// ---------- tabs ----------
var tabsNav=document.getElementById("tabs");
tabsNav.addEventListener("click",function(e){
  var b=e.target.closest("button"); if(!b) return;
  tabsNav.querySelectorAll("button").forEach(function(x){x.classList.remove("active");});
  b.classList.add("active");
  document.querySelectorAll("main section").forEach(function(s){s.classList.remove("active");});
  document.getElementById("tab-"+b.dataset.tab).classList.add("active");
});

// ---------- theme (stored locally per browser) ----------
function applyTheme(){ document.documentElement.setAttribute("data-theme", localStorage.getItem("tylo-theme")||"dark"); }
function toggleTheme(){
  localStorage.setItem("tylo-theme",(localStorage.getItem("tylo-theme")||"dark")==="dark"?"light":"dark");
  applyTheme();
}

// ---------- backup / restore ----------
function exportData(){
  var blob=new Blob([JSON.stringify(S,null,2)],{type:"application/json"});
  var a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download="tyloplanner-backup-"+todayStr()+".json";
  a.click(); URL.revokeObjectURL(a.href);
}
function importData(ev){
  var f=ev.target.files[0]; if(!f) return;
  var r=new FileReader();
  r.onload=async function(){
    try{
      var s=JSON.parse(r.result);
      if(!s||typeof s!=="object"||!("habits" in s)) throw new Error("not a TyloPlanner backup");
      if(!confirm("Replace ALL current data with this backup?")) return;
      await api("POST","/api/restore",s);
      await refresh(); toast("Backup restored.");
    }catch(e){ alert("Restore failed: "+e.message); }
  };
  r.readAsText(f); ev.target.value="";
}

// ---------- chart helper ----------
function barChart(elId,labelId,values,labels,cls,decimals){
  var max=Math.max.apply(null,values.concat([1]));
  var ch="",lb="";
  for(var i=0;i<values.length;i++){
    var pc=Math.round(values[i]/max*100);
    var v=decimals?Math.round(values[i]*Math.pow(10,decimals))/Math.pow(10,decimals):Math.round(values[i]);
    ch+='<div class="bar '+(cls||"")+'" style="height:'+pc+'%"><span>'+(values[i]?v:"")+'</span></div>';
    lb+='<div>'+labels[i]+'</div>';
  }
  document.getElementById(elId).innerHTML=ch;
  document.getElementById(labelId).innerHTML=lb;
}
function last12Months(){
  var out=[],now=new Date();
  for(var i=11;i>=0;i--){
    var d=new Date(now.getFullYear(),now.getMonth()-i,1);
    out.push({key:d.getFullYear()+"-"+z(d.getMonth()+1),label:MONTHS[d.getMonth()]});
  }
  return out;
}

// ---------- planner ----------
var weekOffset=0, addingDay=null;
function moveWeek(d){ if(d===0)weekOffset=0; else weekOffset+=d; addingDay=null; renderPlanner(); }
function renderPlanner(){
  var dates=weekDates(weekOffset);
  document.getElementById("weekLabel").textContent=
    (weekOffset===0?"This week · ":"")+fmtShort(dates[0])+" – "+fmtShort(dates[6])+" "+dates[6].getFullYear();
  var today=todayStr(), html="";
  for(var i=0;i<7;i++){
    var iso=toISO(dates[i]);
    var evs=S.events.filter(function(e){return e.date===iso;})
      .sort(function(a,b){return (a.start||"").localeCompare(b.start||"");});
    html+='<div class="daycol'+(iso===today?' today':'')+'">';
    html+='<h4><span class="dname">'+DAYS[i]+' '+dates[i].getDate()+'</span><button class="btn ghost small" onclick="openAdd(\''+iso+'\')">+</button></h4>';
    evs.forEach(function(e){
      html+='<div class="event '+esc(e.source==="ics"?"ics":e.type)+'"><span class="x" onclick="delRow(\'events\',\''+e.id+'\')">✕</span>'+
        (e.start?'<div class="muted">'+esc(e.start)+(e.end?'–'+esc(e.end):'')+'</div>':'')+
        '<div>'+esc(e.title)+'</div></div>';
    });
    if(addingDay===iso){
      html+='<div class="miniform">'+
        '<input id="evTitle" placeholder="What?">'+
        '<select id="evType"><option value="study">Study</option><option value="other">Other</option><option value="workout">Workout</option></select>'+
        '<div style="display:flex;gap:4px"><input id="evStart" type="time" style="flex:1"><input id="evEnd" type="time" style="flex:1"></div>'+
        '<div style="display:flex;gap:4px"><button class="btn small" style="flex:1" onclick="saveEvent(\''+iso+'\')">Save</button>'+
        '<button class="btn ghost small" onclick="cancelAdd()">✕</button></div></div>';
    }
    html+='</div>';
  }
  document.getElementById("weekGrid").innerHTML=html;
  // Enter saves, Escape cancels, in the add-event mini form
  document.querySelectorAll(".miniform input, .miniform select").forEach(function(el){
    el.addEventListener("keydown",function(ev){
      if(ev.key==="Enter"){ ev.preventDefault(); saveEvent(addingDay); }
      if(ev.key==="Escape") cancelAdd();
    });
  });
  var t=document.getElementById("evTitle"); if(t)t.focus();
}
function openAdd(iso){ addingDay=iso; renderPlanner(); }
function cancelAdd(){ addingDay=null; renderPlanner(); }
async function saveEvent(iso){
  var title=document.getElementById("evTitle").value.trim(); if(!title)return;
  await api("POST","/api/events",{date:iso,title:title,
    type:document.getElementById("evType").value,
    start:document.getElementById("evStart").value,
    end:document.getElementById("evEnd").value,source:"local"});
  addingDay=null; await refresh();
}
async function delRow(table,id){ await api("DELETE","/api/"+table+"/"+id); await refresh(); }

// ---------- exams & grades ----------
async function addExam(){
  var n=document.getElementById("examName").value.trim();
  var d=document.getElementById("examDate").value;
  if(!n||!d){ alert("Name and date required."); return; }
  var ects=parseFloat(document.getElementById("examEcts").value)||null;
  await api("POST","/api/exams",{name:n,date:d,ects:ects});
  document.getElementById("examName").value=""; document.getElementById("examDate").value="";
  document.getElementById("examEcts").value="";
  await refresh();
}
async function setGrade(id,val){
  var g=val===""?null:parseFloat(val);
  await api("PUT","/api/exams/"+id,{grade:g});
  await refresh();
}
function examBadge(d){
  if(d<0) return '<span class="badge gray">past</span>';
  if(d===0) return '<span class="badge red">TODAY</span>';
  var cls=d<7?"red":(d<21?"orange":"green");
  return '<span class="badge '+cls+'">'+d+'d</span>';
}
function renderExams(){
  var list=S.exams.slice().sort(function(a,b){return a.date.localeCompare(b.date);});
  var html='<tr><th>Name</th><th>Date</th><th>Countdown</th><th>ECTS</th><th>Grade</th><th></th></tr>';
  list.forEach(function(e){
    html+='<tr><td>'+esc(e.name)+'</td><td class="muted">'+esc(e.date)+'</td><td>'+examBadge(daysUntil(e.date))+'</td>'+
      '<td>'+(e.ects||"—")+'</td>'+
      '<td><input type="number" step="0.1" min="1" max="10" value="'+(e.grade!=null?e.grade:"")+'" placeholder="—" onchange="setGrade(\''+e.id+'\',this.value)"></td>'+
      '<td><button class="btn danger small" onclick="delRow(\'exams\',\''+e.id+'\')">✕</button></td></tr>';
  });
  document.getElementById("examTable").innerHTML=html+(list.length?"":'<tr><td colspan="6" class="muted">No exams yet.</td></tr>');
}

// ---------- habits ----------
async function addHabit(){
  var n=document.getElementById("habitName").value.trim(); if(!n)return;
  await api("POST","/api/habits",{name:n,created:todayStr()});
  document.getElementById("habitName").value="";
  await refresh();
}
async function delHabit(id){
  if(!confirm("Delete this habit and its history?")) return;
  await api("DELETE","/api/habits/"+id); await refresh();
}
async function toggleHabit(id,iso){
  var key=id+"|"+iso;
  if(habitSet[key]) delete habitSet[key]; else habitSet[key]=true; // optimistic
  renderHabits(); renderDashboard();
  await api("POST","/api/habits/"+id+"/toggle",{date:iso});
}
function streak(hid){
  var c=0,d=parseISO(todayStr());
  if(!habitSet[hid+"|"+toISO(d)]) d.setDate(d.getDate()-1);
  while(habitSet[hid+"|"+toISO(d)]){ c++; d.setDate(d.getDate()-1); }
  return c;
}
function renderHabits(){
  var dates=weekDates(0),today=todayStr();
  var html='<tr><th>Habit</th>';
  for(var i=0;i<7;i++) html+='<th'+(toISO(dates[i])===today?' style="color:var(--accent)"':'')+'>'+DAYS[i]+'</th>';
  html+='<th>Streak</th><th></th></tr>';
  S.habits.forEach(function(h){
    html+='<tr><td>'+esc(h.name)+'</td>';
    for(var k=0;k<7;k++){
      var iso=toISO(dates[k]),on=!!habitSet[h.id+"|"+iso];
      html+='<td><span class="hcheck'+(on?' on':'')+'" onclick="toggleHabit(\''+h.id+'\',\''+iso+'\')">'+(on?'✓':'')+'</span></td>';
    }
    html+='<td><span class="badge '+(streak(h.id)>0?'green':'gray')+'">'+streak(h.id)+'🔥</span></td>';
    html+='<td><button class="btn danger small" onclick="delHabit(\''+h.id+'\')">✕</button></td></tr>';
  });
  document.getElementById("habitTable").innerHTML=html+(S.habits.length?"":'<tr><td colspan="10" class="muted">No habits yet — add one above.</td></tr>');
}

// ---------- workouts ----------
var WTYPES={run:"🏃 Run",bike:"🚴 Bike",gym:"🏋️ Gym"};
async function addWorkout(){
  var dur=parseFloat(document.getElementById("wDur").value)||0;
  var dist=parseFloat(document.getElementById("wDist").value)||0;
  if(!dur&&!dist){ alert("Enter at least minutes or km."); return; }
  await api("POST","/api/workouts",{
    type:document.getElementById("wType").value,
    date:document.getElementById("wDate").value||todayStr(),
    dur:dur,dist:dist,note:document.getElementById("wNote").value.trim(),source:"manual"});
  document.getElementById("wDur").value="";document.getElementById("wDist").value="";document.getElementById("wNote").value="";
  await refresh();
}
function weekTotals(off){
  var ds=weekDates(off),a=toISO(ds[0]),b=toISO(ds[6]);
  var t={count:0,runKm:0,bikeKm:0,min:0,gym:0};
  S.workouts.forEach(function(w){
    if(w.date<a||w.date>b) return;
    t.count++; t.min+=w.dur||0;
    if(w.type==="gym") t.gym++;
    else if(w.type==="run") t.runKm+=w.dist||0;
    else if(w.type==="bike") t.bikeKm+=w.dist||0;
  });
  return t;
}
function renderWorkouts(){
  var t=weekTotals(0);
  document.getElementById("wStats").innerHTML=
    '<div class="stat"><div class="v">'+t.count+'</div><div class="l">sessions</div></div>'+
    '<div class="stat"><div class="v">'+(Math.round(t.runKm*10)/10)+'</div><div class="l">run km</div></div>'+
    '<div class="stat"><div class="v">'+(Math.round(t.bikeKm*10)/10)+'</div><div class="l">bike km</div></div>'+
    '<div class="stat"><div class="v">'+Math.round(t.min)+'</div><div class="l">minutes</div></div>'+
    '<div class="stat"><div class="v">'+t.gym+'</div><div class="l">gym sessions</div></div>';
  var list=S.workouts.slice().sort(function(a,b){return b.date.localeCompare(a.date);}).slice(0,50);
  var html="";
  list.forEach(function(w){
    html+='<div class="list-item"><div class="grow"><div>'+WTYPES[w.type]+
      (w.dist?' · '+w.dist+' km':'')+(w.dur?' · '+w.dur+' min':'')+
      (w.source==="strava"?' <span class="badge blue">strava</span>':'')+'</div>'+
      '<div class="muted">'+esc(w.date)+(w.note?' — '+esc(w.note):'')+'</div></div>'+
      '<button class="btn danger small" onclick="delRow(\'workouts\',\''+w.id+'\')">✕</button></div>';
  });
  document.getElementById("wList").innerHTML=html||'<div class="muted">No workouts logged yet.</div>';
  document.getElementById("stravaSyncBtn").style.display=S.strava.connected?"inline-block":"none";
}

// ---------- tasks ----------
async function addTask(){
  var n=document.getElementById("taskName").value.trim(); if(!n)return;
  await api("POST","/api/tasks",{name:n,done:0,created:todayStr()});
  document.getElementById("taskName").value="";
  await refresh();
}
async function toggleTask(id,done){
  await api("PUT","/api/tasks/"+id,{done:done?1:0,completed_at:done?todayStr():null});
  await refresh();
}
function renderTasks(){
  var open=S.tasks.filter(function(t){return !t.done;});
  var done=S.tasks.filter(function(t){return t.done;});
  var html="";
  open.concat(done).forEach(function(t){
    html+='<div class="checkbox-task"><input type="checkbox" '+(t.done?'checked':'')+' onchange="toggleTask(\''+t.id+'\',this.checked)">'+
      '<span class="'+(t.done?'done':'')+'" style="flex:1">'+esc(t.name)+'</span>'+
      '<button class="btn danger small" onclick="delRow(\'tasks\',\''+t.id+'\')">✕</button></div>';
  });
  document.getElementById("taskList").innerHTML=html||'<div class="muted">Nothing to do. Nice.</div>';
}

// ---------- notes ----------
var currentNote=null, noteTimer=null;
async function newNote(){
  var r=await api("POST","/api/notes",{title:"",body:"",updated:Date.now()});
  currentNote=r.id; await refresh();
  document.getElementById("noteTitle").focus();
}
function selectNote(id){ currentNote=id; renderNotes(); }
function noteChanged(){
  clearTimeout(noteTimer);
  noteTimer=setTimeout(async function(){
    if(!currentNote) return;
    await api("PUT","/api/notes/"+currentNote,{
      title:document.getElementById("noteTitle").value,
      body:document.getElementById("noteBody").value,
      updated:Date.now()});
    var n=S.notes.find(function(x){return x.id===currentNote;});
    if(n){ n.title=document.getElementById("noteTitle").value; n.body=document.getElementById("noteBody").value; n.updated=Date.now(); }
    renderNoteList();
  },500);
}
async function deleteNote(){
  if(!confirm("Delete this note?")) return;
  await api("DELETE","/api/notes/"+currentNote);
  currentNote=null; await refresh();
}
function renderNoteList(){
  var list=S.notes.slice().sort(function(a,b){return (b.updated||0)-(a.updated||0);});
  var html="";
  list.forEach(function(n){
    html+='<div class="list-item'+(n.id===currentNote?' sel':'')+'" onclick="selectNote(\''+n.id+'\')">'+
      '<div class="grow"><div>'+(esc(n.title)||'<span class="muted">Untitled</span>')+'</div>'+
      '<div class="muted">'+new Date(n.updated||0).toLocaleDateString()+'</div></div></div>';
  });
  document.getElementById("noteList").innerHTML=html||'<div class="muted">No notes yet.</div>';
}
function renderNotes(){
  renderNoteList();
  var ed=document.getElementById("noteEditor");
  var n=S.notes.find(function(x){return x.id===currentNote;});
  if(!n){ ed.style.display="none"; return; }
  ed.style.display="block";
  document.getElementById("noteTitle").value=n.title||"";
  document.getElementById("noteBody").value=n.body||"";
  document.getElementById("noteMeta").textContent="Last edited "+new Date(n.updated||0).toLocaleString();
}

// ---------- analytics ----------
function renderAnalytics(){
  var months=last12Months();
  var sessions={},kmRun={},kmBike={},study={},habits={};
  months.forEach(function(m){ sessions[m.key]=0;kmRun[m.key]=0;kmBike[m.key]=0;study[m.key]=0;habits[m.key]=0; });

  var totRunKm=0,totBikeKm=0,totMin=0,totSessions=0,totStudyH=0,totChecks=0;
  S.workouts.forEach(function(w){
    var k=(w.date||"").slice(0,7);
    totSessions++; totMin+=w.dur||0;
    if(w.type==="run") totRunKm+=w.dist||0;
    if(w.type==="bike") totBikeKm+=w.dist||0;
    if(k in sessions){
      sessions[k]++;
      if(w.type==="run") kmRun[k]+=w.dist||0;
      if(w.type==="bike") kmBike[k]+=w.dist||0;
    }
  });
  S.events.forEach(function(e){
    if(e.type!=="study"||!e.start||!e.end) return;
    var h=(parseInt(e.end,10)-parseInt(e.start,10))+
      ((parseInt(e.end.slice(3),10)||0)-(parseInt(e.start.slice(3),10)||0))/60;
    if(h<=0) return;
    totStudyH+=h;
    var k=(e.date||"").slice(0,7);
    if(k in study) study[k]+=h;
  });
  S.habit_log.forEach(function(l){
    totChecks++;
    var k=(l.date||"").slice(0,7);
    if(k in habits) habits[k]++;
  });

  // grades
  var graded=S.exams.filter(function(e){return e.grade!=null;});
  var avg=null;
  if(graded.length){
    var wsum=0,sum=0;
    graded.forEach(function(e){ var w=e.ects||1; wsum+=w; sum+=e.grade*w; });
    avg=Math.round(sum/wsum*100)/100;
  }

  document.getElementById("aTotals").innerHTML=
    '<div class="stat"><div class="v">'+totSessions+'</div><div class="l">workouts</div></div>'+
    '<div class="stat"><div class="v">'+Math.round(totRunKm)+'</div><div class="l">run km</div></div>'+
    '<div class="stat"><div class="v">'+Math.round(totBikeKm)+'</div><div class="l">bike km</div></div>'+
    '<div class="stat"><div class="v">'+Math.round(totMin/60)+'</div><div class="l">training hrs</div></div>'+
    '<div class="stat"><div class="v">'+Math.round(totStudyH)+'</div><div class="l">study hrs planned</div></div>'+
    '<div class="stat"><div class="v">'+totChecks+'</div><div class="l">habit check-ins</div></div>'+
    '<div class="stat"><div class="v">'+(avg!=null?avg:"—")+'</div><div class="l">avg grade'+(graded.length?" ("+graded.length+")":"")+'</div></div>';

  var labels=months.map(function(m){return m.label;});
  barChart("aWorkouts","aWorkoutsL",months.map(function(m){return sessions[m.key];}),labels,"",0);
  barChart("aKmRun","aKmRunL",months.map(function(m){return kmRun[m.key];}),labels,"green",1);
  barChart("aKmBike","aKmBikeL",months.map(function(m){return kmBike[m.key];}),labels,"green",1);
  barChart("aStudy","aStudyL",months.map(function(m){return study[m.key];}),labels,"orange",1);
  barChart("aHabits","aHabitsL",months.map(function(m){return habits[m.key];}),labels,"",0);

  var gh="";
  if(graded.length){
    gh='<table class="grades"><tr><th>Exam</th><th>Date</th><th>ECTS</th><th>Grade</th></tr>';
    graded.slice().sort(function(a,b){return b.date.localeCompare(a.date);}).forEach(function(e){
      var cls=e.grade>=5.5?"green":"red";
      gh+='<tr><td>'+esc(e.name)+'</td><td class="muted">'+esc(e.date)+'</td><td>'+(e.ects||"—")+'</td>'+
        '<td><span class="badge '+cls+'">'+e.grade+'</span></td></tr>';
    });
    gh+='</table>';
    if(avg!=null) gh+='<p style="margin-top:10px;font-size:14px">Weighted average (by ECTS): <b>'+avg+'</b></p>';
  } else gh='<div class="muted">No grades entered yet — add them in the Exams &amp; grades tab.</div>';
  document.getElementById("aGrades").innerHTML=gh;
}

// ---------- dashboard ----------
function renderDashboard(){
  var now=new Date(),hr=now.getHours();
  var g=hr<6?"Good night":hr<12?"Good morning":hr<18?"Good afternoon":"Good evening";
  document.getElementById("greeting").textContent=g+" 👋";
  document.getElementById("headerDate").textContent=fmtShort(now)+" "+now.getFullYear();
  var today=todayStr(),html="";

  var exams=S.exams.filter(function(e){return daysUntil(e.date)>=0;})
    .sort(function(a,b){return a.date.localeCompare(b.date);}).slice(0,3);
  html+='<div class="card"><h3>Next deadlines</h3>';
  if(exams.length) exams.forEach(function(e){
    html+='<div class="list-item"><div class="grow">'+esc(e.name)+'</div>'+examBadge(daysUntil(e.date))+'</div>';});
  else html+='<div class="muted">Nothing upcoming.</div>';
  html+='</div>';

  var evs=S.events.filter(function(e){return e.date===today;})
    .sort(function(a,b){return (a.start||"").localeCompare(b.start||"");});
  html+='<div class="card"><h3>Today’s plan</h3>';
  if(evs.length) evs.forEach(function(ev){
    html+='<div class="list-item"><div class="grow">'+esc(ev.title)+'</div><span class="muted">'+esc(ev.start||"")+'</span></div>';});
  else html+='<div class="muted">Nothing planned today.</div>';
  html+='</div>';

  html+='<div class="card"><h3>Habits today</h3>';
  if(S.habits.length) S.habits.forEach(function(h){
    var on=!!habitSet[h.id+"|"+today];
    html+='<div class="list-item"><span class="hcheck'+(on?' on':'')+'" onclick="toggleHabit(\''+h.id+'\',\''+today+'\')">'+(on?'✓':'')+'</span><div class="grow">'+esc(h.name)+'</div><span class="badge '+(streak(h.id)>0?'green':'gray')+'">'+streak(h.id)+'🔥</span></div>';});
  else html+='<div class="muted">No habits yet.</div>';
  html+='</div>';

  var t=weekTotals(0);
  html+='<div class="card"><h3>Training this week</h3><div class="wstats">'+
    '<div class="stat"><div class="v">'+t.count+'</div><div class="l">sessions</div></div>'+
    '<div class="stat"><div class="v">'+(Math.round(t.runKm*10)/10)+'</div><div class="l">run km</div></div>'+
    '<div class="stat"><div class="v">'+(Math.round(t.bikeKm*10)/10)+'</div><div class="l">bike km</div></div>'+
    '<div class="stat"><div class="v">'+Math.round(t.min)+'</div><div class="l">min</div></div></div></div>';

  var open=S.tasks.filter(function(x){return !x.done;}).slice(0,5);
  html+='<div class="card"><h3>Open to-dos</h3>';
  if(open.length) open.forEach(function(o){
    html+='<div class="checkbox-task"><input type="checkbox" onchange="toggleTask(\''+o.id+'\',true)"><span>'+esc(o.name)+'</span></div>';});
  else html+='<div class="muted">All clear ✨</div>';
  html+='</div>';

  document.getElementById("dashCards").innerHTML=html;
}

// ---------- settings ----------
function renderSettings(){
  document.getElementById("icsUrl").textContent=S.feed_url;
  document.getElementById("icsDownload").href=S.feed_url;
  document.getElementById("logoutBtn").style.display=S.auth.enabled?"inline-block":"none";
  var box=document.getElementById("stravaBox"),html="";
  var host=(S.app_url||location.origin).replace(/^https?:\/\//,"").replace(/:\d+$/,"").replace(/\/.*$/,"");
  if(!S.strava.configured||stravaEditing){
    html='<p style="font-size:14px;margin-bottom:10px">Connect Strava in three steps — no server access needed:</p>'+
      '<ol style="font-size:14px;margin:0 0 12px 18px;line-height:1.7">'+
      '<li>Create a free API app at <a href="https://www.strava.com/settings/api" target="_blank" style="color:var(--accent)">strava.com/settings/api</a></li>'+
      '<li>Set <b>Authorization Callback Domain</b> to: <code class="url">'+esc(host)+'</code></li>'+
      '<li>Copy the <b>Client ID</b> and <b>Client Secret</b> below and save:</li></ol>'+
      '<div class="formrow">'+
      '<input id="stravaCid" placeholder="Client ID" style="width:130px" onkeydown="if(event.keyCode===13)stravaSaveConfig()">'+
      '<input id="stravaSecret" type="password" placeholder="Client Secret" style="flex:1;min-width:200px" onkeydown="if(event.keyCode===13)stravaSaveConfig()">'+
      '<button class="btn" onclick="stravaSaveConfig()">Save keys</button>'+
      (stravaEditing?'<button class="btn ghost" onclick="stravaEditing=false;renderSettings()">Cancel</button>':'')+
      '</div>'+
      (S.strava.from_env?'<p class="muted">Note: keys are currently set via .env, which overrides keys saved here.</p>':'');
  } else if(!S.strava.connected){
    html='<p style="font-size:14px;margin-bottom:10px">✅ API keys saved. Now connect your Strava account:</p>'+
      '<a class="btn" href="/strava/connect" style="text-decoration:none">Connect Strava</a> '+
      '<button class="btn ghost small" onclick="stravaEditing=true;renderSettings()">Edit keys</button> '+
      '<button class="btn danger small" onclick="stravaForget()">Remove keys</button>';
  } else {
    html='<p style="font-size:14px;margin-bottom:10px">✅ Connected.'+
      (S.strava.last_sync?' Last sync: '+esc(S.strava.last_sync):'')+'</p>'+
      '<button class="btn" onclick="stravaSync()">⟳ Sync activities now</button> '+
      '<button class="btn danger small" onclick="stravaDisconnect()">Disconnect</button>';
  }
  box.innerHTML=html;
  renderNotifySettings();
  renderSecurity();
}
// fill an input only when the user isn't typing in it
function setVal(id,v){
  var el=document.getElementById(id);
  if(el&&document.activeElement!==el) el.value=v==null?"":v;
}
function renderNotifySettings(){
  if(!SET) return;
  setVal("ntfyServer",SET.ntfy_server);
  setVal("ntfyTopic",SET.ntfy_topic);
  setVal("agendaTime",SET.notify_agenda_time);
  setVal("habitTime",SET.notify_habit_time);
  setVal("examDays",SET.notify_exam_days);
  setVal("calSyncUrls",SET.cal_sync_urls);
  setVal("calSyncHours",SET.cal_sync_hours);
  document.getElementById("calSyncMeta").textContent=SET.cal_last_sync?("Last sync: "+SET.cal_last_sync):"";
}
async function saveNotifySettings(){
  await api("POST","/api/settings",{
    ntfy_server:document.getElementById("ntfyServer").value.trim()||"https://ntfy.sh",
    ntfy_topic:document.getElementById("ntfyTopic").value.trim(),
    notify_agenda_time:document.getElementById("agendaTime").value||"07:30",
    notify_habit_time:document.getElementById("habitTime").value||"20:00",
    notify_exam_days:document.getElementById("examDays").value.trim()||"7,3,1"});
  toast("Notification settings saved");
  await refresh();
}
async function testNotify(){
  try{ await api("POST","/api/notify/test"); toast("Test sent — check your phone!"); }
  catch(e){ alert(e.message); }
}
async function saveCalSync(){
  await api("POST","/api/settings",{
    cal_sync_urls:document.getElementById("calSyncUrls").value,
    cal_sync_hours:document.getElementById("calSyncHours").value||"6"});
  toast("Calendar sync settings saved");
  await refresh();
}
async function calSyncNow(){
  try{
    toast("Syncing calendars…");
    var j=await api("POST","/api/ics/sync-now");
    toast("Calendar sync done — "+j.added+" new events");
    await refresh();
  }catch(e){ alert(e.message); }
}
// ---------- security (2FA + backups) ----------
var tfaPending=false;
function renderSecurity(){
  var box=document.getElementById("securityBox");
  if(!box||!SET) return;
  var html="";
  if(!S.auth.enabled){
    html='<p style="font-size:14px">Login is disabled — set <b>AUTH_PASSWORD</b> in <b>.env</b> to enable it (required before 2FA makes sense).</p>';
  } else if(SET.totp_enabled){
    html='<p style="font-size:14px;margin-bottom:10px">✅ Two-factor authentication is <b>on</b>. Disable by entering a current code:</p>'+
      '<div class="formrow"><input id="tfaCode" placeholder="123456" maxlength="6" style="width:110px;text-align:center" onkeydown="if(event.keyCode===13)tfaDisable()">'+
      '<button class="btn danger" onclick="tfaDisable()">Disable 2FA</button></div>';
  } else if(tfaPending){
    html='<p style="font-size:14px;margin-bottom:10px">Scan this QR code with Google Authenticator / Aegis / 1Password, then enter the 6-digit code to confirm:</p>'+
      '<img src="/api/2fa/qr?t='+Date.now()+'" alt="2FA QR" style="width:180px;border-radius:10px;background:#fff;padding:8px">'+
      '<div class="formrow" style="margin-top:10px"><input id="tfaCode" placeholder="123456" maxlength="6" style="width:110px;text-align:center" onkeydown="if(event.keyCode===13)tfaConfirm()">'+
      '<button class="btn" onclick="tfaConfirm()">Confirm &amp; enable</button>'+
      '<button class="btn ghost" onclick="tfaPending=false;renderSecurity()">Cancel</button></div>';
  } else {
    html='<p style="font-size:14px;margin-bottom:10px">Add a second login step with an authenticator app (TOTP):</p>'+
      '<button class="btn" onclick="tfaStart()">Enable 2FA</button>';
  }
  html+='<hr style="border:none;border-top:1px solid var(--border);margin:14px 0">'+
    '<p style="font-size:14px;margin-bottom:8px">Automatic backups: a JSON snapshot is written to <b>data/backups/</b> every night (newest 14 kept).'+
    (SET.last_backup?' Last backup: <b>'+esc(SET.last_backup)+'</b>.':' No backup made yet.')+'</p>'+
    '<button class="btn ghost small" onclick="backupNow()">Backup now</button>';
  box.innerHTML=html;
}
async function tfaStart(){
  await api("POST","/api/2fa/setup");
  tfaPending=true;
  renderSecurity();
}
async function tfaConfirm(){
  try{
    await api("POST","/api/2fa/enable",{code:document.getElementById("tfaCode").value.trim()});
    tfaPending=false;
    toast("2FA enabled — you'll be asked for a code at login");
    await refresh();
  }catch(e){ alert(e.message); }
}
async function tfaDisable(){
  try{
    await api("POST","/api/2fa/disable",{code:document.getElementById("tfaCode").value.trim()});
    toast("2FA disabled");
    await refresh();
  }catch(e){ alert(e.message); }
}
async function backupNow(){
  var j=await api("POST","/api/backup/now");
  toast("Backup written: "+j.file);
  await refresh();
}
function copyIcs(){
  navigator.clipboard.writeText(document.getElementById("icsUrl").textContent)
    .then(function(){toast("Feed URL copied");});
}
async function importIcsFile(){
  var f=document.getElementById("icsFile").files[0];
  if(!f){ alert("Choose an .ics file first."); return; }
  var fd=new FormData(); fd.append("file",f);
  var r=await fetch("/api/ics/import",{method:"POST",body:fd});
  var j=await r.json();
  if(j.error) alert(j.error); else toast("Imported "+j.added+" of "+j.found+" events");
  await refresh();
}
async function importIcsUrl(){
  var u=document.getElementById("icsImportUrl").value.trim();
  if(!u){ alert("Paste an iCal URL first."); return; }
  try{
    var j=await api("POST","/api/ics/import",{url:u});
    toast("Imported "+j.added+" of "+j.found+" events");
    await refresh();
  }catch(e){ alert(e.message); }
}
async function clearIcs(){
  if(!confirm("Remove all events imported from calendars?")) return;
  var j=await api("DELETE","/api/ics");
  toast("Removed "+j.deleted+" imported events");
  await refresh();
}
var stravaEditing=false;
async function stravaSaveConfig(){
  try{
    await api("POST","/api/strava/config",{
      client_id:document.getElementById("stravaCid").value.trim(),
      client_secret:document.getElementById("stravaSecret").value.trim()});
    stravaEditing=false;
    toast("Strava keys saved — now click Connect Strava");
    await refresh();
  }catch(e){ alert(e.message); }
}
async function stravaForget(){
  if(!confirm("Remove the saved Strava API keys and connection?")) return;
  await api("DELETE","/api/strava/config");
  await refresh();
}
async function stravaSync(){
  toast("Syncing with Strava…");
  try{
    var j=await api("POST","/api/strava/sync");
    toast("Strava sync done — "+j.added+" new activities");
    await refresh();
  }catch(e){ alert(e.message); }
}
async function stravaDisconnect(){
  await api("POST","/api/strava/disconnect");
  await refresh();
}

// ---------- boot ----------
function renderAll(){
  renderDashboard(); renderAnalytics(); renderPlanner(); renderExams();
  renderHabits(); renderWorkouts(); renderTasks(); renderNotes(); renderSettings();
}
document.getElementById("wDate").value=todayStr();
applyTheme();
if("serviceWorker" in navigator){ navigator.serviceWorker.register("/sw.js").catch(function(){}); }
refresh().then(function(){
  if(new URLSearchParams(location.search).get("strava")==="connected"){
    toast("Strava connected! Syncing…"); stravaSync();
    history.replaceState({},"","/");
  }
}).catch(function(e){
  document.getElementById("dashCards").innerHTML='<div class="card">Could not reach the backend: '+esc(e.message)+'</div>';
});
