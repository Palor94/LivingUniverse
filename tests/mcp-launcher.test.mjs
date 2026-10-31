import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdtemp,mkdir,writeFile,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const exec=promisify(execFile);

test('supervisor retries errors, failed exits and clean unexpected exits without rapid looping',async()=>{
  const {supervise}=await import('../mcp/supervisor.mjs');
  let calls=0;const waits=[],messages=[];
  await supervise({run:async()=>{calls++;if(calls===1)throw Error('fixture unavailable');return calls===2?1:0;},wait:async ms=>waits.push(ms),record:line=>messages.push(line),shouldRun:()=>calls<3});
  assert.equal(calls,3);assert.deepEqual(waits,[60000,60000]);
  assert.match(messages.join(''),/CLIENT_START_FAILED/);assert.match(messages.join(''),/CLIENT_EXIT 1/);assert.match(messages.join(''),/CLIENT_EXIT 0/);
});

test('unattended startup fails without opening a password window when no saved key exists',{skip:process.platform!=='win32'},async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'living-universe-unattended-'));
  try{
    const source=await readFile(new URL('../mcp/run-tunnel.ps1',import.meta.url),'utf8');
    const command="function Add-Type { throw 'Password window must not open' }; & {\n"+source+'\n}';
    await assert.rejects(exec(path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,timeout:10000,env:{...process.env,LOCALAPPDATA:temp,LU_MCP_UNATTENDED:'1',LU_MCP_TUNNEL_CLIENT:'fixture.cmd',LU_MCP_SELF_TEST:'0'}}),err=>{
      assert.match(err.stderr,/Saved encrypted credential unavailable/);assert.doesNotMatch(err.stderr,/Password window must not open/);return true;
    });
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('unattended mode refuses interactive key replacement',async()=>{
  await assert.rejects(exec(process.execPath,['mcp/start-tunnel.mjs','--unattended','--new-key'],{windowsHide:true}),err=>{assert.match(err.stderr,/No key prompt is active/);return true;});
});

test('tunnel launcher has no interactive shell fallback and refuses key arguments',async()=>{
  const script=await readFile(new URL('../mcp/run-tunnel.ps1',import.meta.url),'utf8');
  assert.doesNotMatch(script,/Read-Host|Set-ExecutionPolicy|ExecutionPolicy\s+Bypass/i);
  assert.match(script,/Windows.Controls.PasswordBox/);assert.match(script,/doctorExit/);
  assert.ok(script.indexOf('if($SaveKey)')>script.indexOf('if($doctorExit -ne 0)'));
  await assert.rejects(exec(process.execPath,['mcp/start-tunnel.mjs','--api-key','synthetic-not-secret'],{windowsHide:true}),err=>{assert.match(err.stderr,/No key prompt is active/);assert.doesNotMatch(err.stderr,/synthetic-not-secret/);return true;});
});
test('password window and encrypted-value roundtrip work under Restricted policy without a real key',{skip:process.platform!=='win32'},async()=>{
  const result=await exec(process.execPath,['mcp/start-tunnel.mjs','--self-test'],{windowsHide:true,timeout:20000,env:{...process.env,PSExecutionPolicyPreference:'Restricted'}});
  assert.equal(result.stdout.trim(),'SECURE_INPUT_SELF_TEST_OK');assert.equal(result.stderr,'');
});
test('an existing tunnel stops a second launch before credentials are accessed',{skip:process.platform!=='win32'},async()=>{
  const source=await readFile(new URL('../mcp/run-tunnel.ps1',import.meta.url),'utf8');
  const command="function Get-CimInstance { [pscustomobject]@{CommandLine='tunnel-client.exe run --profile living-universe --profile-dir fixture'} }; function Test-Path { throw 'Unexpected credential access' }; & {\n"+source+'\n}';
  const result=await exec(path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-OutputFormat','Text','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,timeout:10000,env:{...process.env,LU_MCP_SELF_TEST:'0',LU_MCP_TUNNEL_CLIENT:'C:/fixture/tunnel-client.exe'}});
  assert.match(result.stdout,/TUNNEL_ALREADY_RUNNING/);assert.equal(result.stderr,'');
});
test('complete credential flow redacts client output and stores only encrypted test data',{skip:process.platform!=='win32'},async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'living-universe-launcher-'));
  try{
    const fakeClient=path.join(temp,'fake-client.cmd');await writeFile(fakeClient,'@echo off\r\nif "%~1"=="doctor" (\r\necho RESULT ok\r\nexit /b 0\r\n)\r\necho key=%CONTROL_PLANE_API_KEY%\r\necho {"key":"%CONTROL_PLANE_API_KEY%"}\r\nexit /b 1\r\n');
    const source=(await readFile(new URL('../mcp/run-tunnel.ps1',import.meta.url),'utf8')).replace('if($window.ShowDialog() -ne $true)',"$box.Password='sk-TEST-'+('x'*32); if($false)");
    const command='& {\n'+source+'\n} -SaveKey';
    let result;try{result=await exec(path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-STA','-OutputFormat','Text','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,timeout:20000,env:{...process.env,LOCALAPPDATA:temp,LU_MCP_NEW_KEY:'1',LU_MCP_SELF_TEST:'0',LU_MCP_TUNNEL_CLIENT:fakeClient,LU_MCP_PROFILE_DIRECTORY:temp,PSModulePath:path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','Modules')}});}catch(err){result=err;}
    assert.match(result.stdout,/RESULT ok/);assert.doesNotMatch(result.stdout+result.stderr,/'sk-TEST-'|sk-TEST-x/);
    assert.match(result.stdout,/key=\[redacted key\]/);assert.match(result.stdout,/"key":"\[redacted key\]"/);assert.doesNotMatch(result.stderr,/TUNNEL_START_FAILED/);
    const cipher=await readFile(path.join(temp,'LivingUniverse','mcp-tunnel-key.xml'),'utf8');assert.doesNotMatch(cipher,/sk-TEST-x/);
  }finally{assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));await rm(temp,{recursive:true,force:true});}
});
