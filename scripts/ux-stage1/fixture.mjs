const generation = '22222222-2222-4222-8222-222222222222';
const meal = (id, calories) => ({ id, name: 'Comida sintética', calories, type: 'Almuerzo', time: '13:00' });
const workout = (id, calories) => ({ id, activity: 'Gimnasio', duration: 45, calories, time: '17:00', muscles: [] });
const day = (dateStr, extra={}) => ({dateStr, date:dateStr+'T12:00:00', meals:[],workouts:[],steps:0,water:0,generation,version:'1',...extra});
const profile = (id,name,records) => ({id,user_id:id,name,age:30,sex:'Masculino',height:175,weight:73,activity:'Moderado',goal:'Mantenimiento',onboarding_completed:true,avatar_path:null,recordProtocol:'atomic',recordGeneration:generation,records});
const records = {
  '2026-08-03': day('2026-08-03',{meals:[meal('aug-food',2100)],steps:4500}),
  '2026-09-08': day('2026-09-08',{meals:[meal('sep-food',1900)],workouts:[workout('sep-gym',220)]}),
  '2026-10-04': day('2026-10-04',{meals:[meal('oct-food',1700)],steps:2200}),
  '2026-10-05': day('2026-10-05',{steps:1000}),
  '2026-10-31': day('2026-10-31',{meals:[meal('oct-last',2400)],steps:6400}),
  '2026-11-01': day('2026-11-01',{meals:[meal('nov-first',1800)],steps:4300}),
  '2026-11-09': day('2026-11-09',{meals:[meal('nov-mon',2000)],steps:2000}),
  '2026-11-10': day('2026-11-10',{steps:3200}),
  '2026-11-15': day('2026-11-15',{meals:[meal('nov-sun',2200)],steps:3500}),
  '2026-11-16': day('2026-11-16',{steps:2600,water:750}),
  '2026-11-17': day('2026-11-17',{meals:[meal('nov-tue',1500)],workouts:[workout('nov-gym',500)],steps:5000,water:1750}),
};
const scenarios = (today, data) => ({today,profiles:{A:profile('stage1-synthetic-a','Alex',data),B:profile('stage1-synthetic-b','Sol',{})}});
export const cases = {
  main: scenarios('2026-11-17',records),
  empty: scenarios('2026-11-17',{}),
  zeros: scenarios('2026-11-17',{
    '2026-11-16':day('2026-11-16'),
    '2026-11-17':day('2026-11-17',{meals:[meal('real-zero',0)],workouts:[workout('zero-workout',0)]}),
  }),
  yearBoundary: scenarios('2027-01-02',{
    '2026-12-27':day('2026-12-27',{meals:[meal('sun',2200)],steps:4000}),
    '2026-12-28':day('2026-12-28',{steps:2000}),
    '2026-12-31':day('2026-12-31',{meals:[meal('last',1800)]}),
    '2027-01-01':day('2027-01-01',{meals:[meal('first',1200)],steps:5500}),
  }),
  monthBoundary: scenarios('2026-11-01',{
    '2026-10-25':day('2026-10-25',{meals:[meal('prior-sun',2000)]}),
    '2026-10-26':day('2026-10-26',{meals:[meal('mon',2200)]}),
    '2026-10-31':day('2026-10-31',{steps:5000}),
    '2026-11-01':day('2026-11-01',{meals:[meal('sun',1700)]}),
  }),
};
