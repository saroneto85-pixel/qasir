import assert from 'node:assert/strict';
import * as L from './resto-logic.js';
const nasi={id:'p1',name:'Nasi Goreng',price:20000,costPrice:8000,category:'Makanan'}, teh={id:'p2',name:'Es Teh',price:5000,costPrice:1000};
const o={items:[],tickets:[]};

L.addItem(o,nasi);L.addItem(o,nasi);L.addItem(o,teh);L.addItem(o,nasi,'tidak pedas');
assert.equal(o.items.length,3,'catatan berbeda = baris berbeda');
assert.equal(L.orderSubtotal(o),20000*3+5000);
assert.equal(L.orderQty(o),4);

let t=L.makeTicket(o,1000,'t1');
assert.equal(t.items.length,3); assert.deepEqual(L.pendingItems(o),[]);
assert.equal(L.makeTicket(o),null,'tanpa item baru tidak membuat tiket');

L.addItem(o,nasi); // tambah susulan
t=L.makeTicket(o,2000,'t2');
assert.deepEqual(t.items,[{name:'Nasi Goreng',qty:1,note:''}],'hanya selisih yang dikirim');
assert.equal(o.tickets.length,2);

assert.equal(L.needsPinToReduce(o,0),true,'kurangi item yang sudah dimasak butuh PIN');
const o2={items:[],tickets:[]};L.addItem(o2,teh);
assert.equal(L.needsPinToReduce(o2,0),false);
assert.equal(L.changeQty(o2,0,-1),false); assert.equal(o2.items.length,0);

assert.equal(L.payable({items:[{price:10000,qty:2}]},25000),null,'diskon > subtotal ditolak');
assert.deepEqual(L.payable({items:[{price:10000,qty:2}]},5000),{sub:20000,discount:5000,total:15000});
assert.equal(L.minutesSince(0,180000),3);
assert.deepEqual(L.missingTableNames([{name:'Meja 2'}],3),['Meja 1','Meja 3']);
assert.equal(L.hasActiveTickets({tickets:[{status:'saji'}]}),false);
console.log('Semua uji logika lulus');
