import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url)),url='http://127.0.0.1:4317/';
const ready=async()=>{try{return (await fetch(url,{signal:AbortSignal.timeout(1500)})).ok;}catch{return false;}};
if(!await ready()){
  const child=spawn('cmd.exe',['/d','/s','/c','"Start Living Universe.cmd"'],{cwd,detached:true,windowsHide:true,stdio:'ignore'});child.unref();
  const deadline=Date.now()+60000;
  while(!await ready()){if(Date.now()>deadline)throw Error('A program nem indult el egy percen belül. Indítsd a Start Living Universe.cmd fájlt a hiba megtekintéséhez.');await new Promise(resolve=>setTimeout(resolve,500));}
}
const browser=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Start-Process 'http://127.0.0.1:4317/#/play'"],{windowsHide:true,stdio:'inherit'});
browser.on('error',error=>{console.error(error.message);process.exitCode=1;});
