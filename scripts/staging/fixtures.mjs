import {createHash} from 'node:crypto';
export const accounts=['calori-staging-a@example.test','calori-staging-b@example.test'];
const id=(owner,kind)=>{const b=createHash('sha256').update(owner+':calori-staging-v9-1:'+kind).digest().subarray(0,16);b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const s=b.toString('hex');return`${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;};
export function fixtures(owner,label,date){
 const yesterday=new Date(date+'T12:00:00Z');yesterday.setUTCDate(yesterday.getUTCDate()-1);
 const dates=[date,yesterday.toISOString().slice(0,10)];
 const days=dates.map((d,i)=>({id:id(owner,'day:'+d),user_id:owner,profile_id:owner,date:d,steps:9000+i*1000,water_ml:1750,weight:label==='A'?70:78}));
 return{profile:{id:owner,user_id:owner,name:'Staging sintético '+label,age:30,gender:'Masculino',height_cm:175,weight_kg:days[0].weight,goal:'Mantenimiento',activity_level:'Moderado',onboarding_completed:false,avatar_path:owner+'/profile.jpg'},days,
  meals:days.map((d,i)=>({id:id(owner,'meal:'+d.date),user_id:owner,daily_log_id:d.id,date:d.date,description:'Comida sintética '+label,meal_type:'Almuerzo',calories:500+i*150,time_str:'13:00',meal_details:'Fixture sin información personal',photo_path:owner+'/'+id(owner,'meal:'+d.date)+'.jpg'})),
  workouts:days.map(d=>({id:id(owner,'workout:'+d.date),user_id:owner,daily_log_id:d.id,date:d.date,activity_name:'Correr',duration_min:30,calories_burned:200,time_str:'18:00',workout_details:'Entrenamiento sintético',distance_km:4,pace_str:'7:30'})),
  goals:[{id:id(owner,'goal:'+date),user_id:owner,type:'workout_sessions',target:3,step_threshold:null,start_date:date,end_date:new Date(new Date(date+'T12:00:00Z').getTime()+6*86400000).toISOString().slice(0,10)},
   {id:id(owner,'goal:steps:'+date),user_id:owner,type:'step_days',target:5,step_threshold:8000,start_date:date,end_date:new Date(new Date(date+'T12:00:00Z').getTime()+6*86400000).toISOString().slice(0,10)}]};
}
