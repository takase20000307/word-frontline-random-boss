import {englishQuestions} from './questions-english.mjs';
import {puzzleQuestions} from './questions-puzzles.mjs';
const practice=[
 {id:'practice1',practice:true,kind:'observe',category:'練習・観察',title:'まずは送信してみよう',prompt:'この中のゴーストは何体？',options:['2体','3体','4体','5体'],answer:1,explanation:'ゴーストは3体。まず自分で予想し、相談したあと「最終回答」で送信しましょう。',visual:{type:'grid',items:['👻','🎃','👻','🍬','🦇','👻'],columns:3},source:'オリジナル練習問題'},
 {id:'practice2',practice:true,kind:'memory',category:'練習・記憶',title:'消える画面を覚えよう',prompt:'左から2番目にあったものは？',options:['🎃 カボチャ','👻 ゴースト','🦇 コウモリ','🍬 キャンディ'],answer:2,explanation:'並びは「🎃 → 🦇 → 👻 → 🍬」。記憶問題では最初だけ絵が出ます。',visual:{type:'sequence',items:['🎃','🦇','👻','🍬'],columns:4},memorySeconds:5,source:'オリジナル練習問題'}
];
const groups=['observe','memory','logic'].map(k=>puzzleQuestions.filter(q=>q.kind===k));
const mixed=[];while(groups.some(a=>a.length))for(const a of groups)if(a.length)mixed.push(a.shift());
const scored=englishQuestions.flatMap((q,i)=>[q,mixed[i*2],mixed[i*2+1]]).map((q,i)=>({...q,final:i>=20}));
export const QUESTIONS=[...practice,...scored];
