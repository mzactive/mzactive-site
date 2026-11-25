/* MZA original bilingual exercise-name index. No third-party media. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MZAExerciseLibrary=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const categories={strength:['Strength','القوة'],core:['Core','الجذع'],run:['Running','الجري'],mobility:['Mobility','المرونة'],bike:['Cycling','الدراجات'],swim:['Swimming','السباحة'],recovery:['Recovery','الاستشفاء']};
const sport={strength:'strength',core:'strength',run:'run',mobility:'recovery',bike:'bike',swim:'swim',recovery:'recovery'};
const catalog=[
 {
  "id": "mza-1",
  "category": "strength",
  "en": "Goblet squat",
  "ar": "القرفصاء بالدمبل",
  "muscle": "Legs / الساقان",
  "equipment": "Dumbbell / دمبل"
 },
 {
  "id": "mza-2",
  "category": "strength",
  "en": "Bodyweight squat",
  "ar": "القرفصاء بوزن الجسم",
  "muscle": "Legs / الساقان",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-3",
  "category": "strength",
  "en": "Barbell back squat",
  "ar": "القرفصاء بالبار الخلفي",
  "muscle": "Legs / الساقان",
  "equipment": "Barbell / بار"
 },
 {
  "id": "mza-4",
  "category": "strength",
  "en": "Front squat",
  "ar": "القرفصاء الأمامية",
  "muscle": "Legs / الساقان",
  "equipment": "Barbell / بار"
 },
 {
  "id": "mza-5",
  "category": "strength",
  "en": "Romanian deadlift",
  "ar": "الرفعة المميتة الرومانية",
  "muscle": "Hamstrings / العضلات الخلفية للفخذ",
  "equipment": "Dumbbell or barbell / دمبل أو بار"
 },
 {
  "id": "mza-6",
  "category": "strength",
  "en": "Conventional deadlift",
  "ar": "الرفعة المميتة التقليدية",
  "muscle": "Posterior chain / العضلات الخلفية",
  "equipment": "Barbell / بار"
 },
 {
  "id": "mza-7",
  "category": "strength",
  "en": "Single-leg Romanian deadlift",
  "ar": "الرفعة الرومانية بساق واحدة",
  "muscle": "Hamstrings / العضلات الخلفية للفخذ",
  "equipment": "Dumbbell / دمبل"
 },
 {
  "id": "mza-8",
  "category": "strength",
  "en": "Step-up",
  "ar": "الصعود على صندوق",
  "muscle": "Legs / الساقان",
  "equipment": "Box / صندوق"
 },
 {
  "id": "mza-9",
  "category": "strength",
  "en": "Lateral step-down",
  "ar": "النزول الجانبي من صندوق",
  "muscle": "Legs / الساقان",
  "equipment": "Box / صندوق"
 },
 {
  "id": "mza-10",
  "category": "strength",
  "en": "Reverse lunge",
  "ar": "الاندفاع للخلف",
  "muscle": "Legs / الساقان",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-11",
  "category": "strength",
  "en": "Forward lunge",
  "ar": "الاندفاع للأمام",
  "muscle": "Legs / الساقان",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-12",
  "category": "strength",
  "en": "Bulgarian split squat",
  "ar": "القرفصاء البلغارية",
  "muscle": "Legs / الساقان",
  "equipment": "Bench / مقعد"
 },
 {
  "id": "mza-13",
  "category": "strength",
  "en": "Standing calf raise",
  "ar": "رفع الكعب واقفاً",
  "muscle": "Calves / عضلات السمانة",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-14",
  "category": "strength",
  "en": "Seated calf raise",
  "ar": "رفع الكعب جالساً",
  "muscle": "Calves / عضلات السمانة",
  "equipment": "Machine or dumbbell / جهاز أو دمبل"
 },
 {
  "id": "mza-15",
  "category": "strength",
  "en": "Single-leg calf raise",
  "ar": "رفع الكعب بساق واحدة",
  "muscle": "Calves / عضلات السمانة",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-16",
  "category": "strength",
  "en": "Glute bridge",
  "ar": "جسر الأرداف",
  "muscle": "Glutes / الأرداف",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-17",
  "category": "strength",
  "en": "Single-leg glute bridge",
  "ar": "جسر الأرداف بساق واحدة",
  "muscle": "Glutes / الأرداف",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-18",
  "category": "strength",
  "en": "Hip thrust",
  "ar": "دفع الحوض",
  "muscle": "Glutes / الأرداف",
  "equipment": "Bench / مقعد"
 },
 {
  "id": "mza-19",
  "category": "strength",
  "en": "Leg press",
  "ar": "ضغط الساقين",
  "muscle": "Legs / الساقان",
  "equipment": "Machine / جهاز"
 },
 {
  "id": "mza-20",
  "category": "strength",
  "en": "Leg curl",
  "ar": "ثني الساق",
  "muscle": "Hamstrings / العضلات الخلفية للفخذ",
  "equipment": "Machine / جهاز"
 },
 {
  "id": "mza-21",
  "category": "strength",
  "en": "Leg extension",
  "ar": "مد الساق",
  "muscle": "Quadriceps / العضلات الأمامية للفخذ",
  "equipment": "Machine / جهاز"
 },
 {
  "id": "mza-22",
  "category": "strength",
  "en": "Push-up",
  "ar": "تمرين الضغط",
  "muscle": "Chest / الصدر",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-23",
  "category": "strength",
  "en": "Incline push-up",
  "ar": "الضغط المائل",
  "muscle": "Chest / الصدر",
  "equipment": "Bench / مقعد"
 },
 {
  "id": "mza-24",
  "category": "strength",
  "en": "Dumbbell bench press",
  "ar": "ضغط الصدر بالدمبل",
  "muscle": "Chest / الصدر",
  "equipment": "Dumbbell / دمبل"
 },
 {
  "id": "mza-25",
  "category": "strength",
  "en": "Barbell bench press",
  "ar": "ضغط الصدر بالبار",
  "muscle": "Chest / الصدر",
  "equipment": "Barbell / بار"
 },
 {
  "id": "mza-26",
  "category": "strength",
  "en": "Dumbbell overhead press",
  "ar": "ضغط الكتف بالدمبل",
  "muscle": "Shoulders / الكتفان",
  "equipment": "Dumbbell / دمبل"
 },
 {
  "id": "mza-27",
  "category": "strength",
  "en": "Dumbbell lateral raise",
  "ar": "الرفع الجانبي للدمبل",
  "muscle": "Shoulders / الكتفان",
  "equipment": "Dumbbell / دمبل"
 },
 {
  "id": "mza-28",
  "category": "strength",
  "en": "Single-arm dumbbell row",
  "ar": "السحب بالدمبل بذراع واحدة",
  "muscle": "Back / الظهر",
  "equipment": "Dumbbell / دمبل"
 },
 {
  "id": "mza-29",
  "category": "strength",
  "en": "Resistance band row",
  "ar": "السحب بالشريط المطاطي",
  "muscle": "Back / الظهر",
  "equipment": "Band / شريط مطاطي"
 },
 {
  "id": "mza-30",
  "category": "strength",
  "en": "Lat pulldown",
  "ar": "السحب العلوي",
  "muscle": "Back / الظهر",
  "equipment": "Machine / جهاز"
 },
 {
  "id": "mza-31",
  "category": "strength",
  "en": "Pull-up",
  "ar": "العقلة",
  "muscle": "Back / الظهر",
  "equipment": "Pull-up bar / عقلة"
 },
 {
  "id": "mza-32",
  "category": "strength",
  "en": "Seated cable row",
  "ar": "السحب بالكابل جالساً",
  "muscle": "Back / الظهر",
  "equipment": "Cable / كابل"
 },
 {
  "id": "mza-33",
  "category": "strength",
  "en": "Biceps curl",
  "ar": "ثني الذراع للعضلة ذات الرأسين",
  "muscle": "Arms / الذراعان",
  "equipment": "Dumbbell / دمبل"
 },
 {
  "id": "mza-34",
  "category": "strength",
  "en": "Triceps pushdown",
  "ar": "مد الذراع للأسفل بالكابل",
  "muscle": "Arms / الذراعان",
  "equipment": "Cable / كابل"
 },
 {
  "id": "mza-35",
  "category": "strength",
  "en": "Farmer carry",
  "ar": "المشي بحمل الأوزان",
  "muscle": "Full body / الجسم كاملاً",
  "equipment": "Dumbbell / دمبل"
 },
 {
  "id": "mza-36",
  "category": "core",
  "en": "Forearm plank",
  "ar": "البلانك على الساعدين",
  "muscle": "Core / الجذع",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-37",
  "category": "core",
  "en": "Side plank",
  "ar": "البلانك الجانبي",
  "muscle": "Core / الجذع",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-38",
  "category": "core",
  "en": "Dead bug",
  "ar": "تمرين الحشرة الميتة",
  "muscle": "Core / الجذع",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-39",
  "category": "core",
  "en": "Bird dog",
  "ar": "مد الذراع والساق المتقابلة",
  "muscle": "Core / الجذع",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-40",
  "category": "core",
  "en": "Pallof press",
  "ar": "مقاومة دوران الجذع",
  "muscle": "Core / الجذع",
  "equipment": "Band / شريط مطاطي"
 },
 {
  "id": "mza-41",
  "category": "core",
  "en": "Mountain climber",
  "ar": "متسلق الجبال",
  "muscle": "Core / الجذع",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-42",
  "category": "core",
  "en": "Hollow hold",
  "ar": "الثبات بوضعية التجويف",
  "muscle": "Core / الجذع",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-43",
  "category": "core",
  "en": "Reverse crunch",
  "ar": "تمرين البطن العكسي",
  "muscle": "Core / الجذع",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-44",
  "category": "run",
  "en": "Easy run",
  "ar": "الجري السهل",
  "muscle": "Aerobic / التحمل الهوائي",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-45",
  "category": "run",
  "en": "Long run",
  "ar": "الجري الطويل",
  "muscle": "Endurance / التحمل",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-46",
  "category": "run",
  "en": "Tempo run",
  "ar": "جري التمبو",
  "muscle": "Threshold / العتبة",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-47",
  "category": "run",
  "en": "Threshold intervals",
  "ar": "فترات الجري عند العتبة",
  "muscle": "Threshold / العتبة",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-48",
  "category": "run",
  "en": "Running intervals",
  "ar": "فترات الجري المتقطعة",
  "muscle": "Speed / السرعة",
  "equipment": "Track optional / مضمار اختياري"
 },
 {
  "id": "mza-49",
  "category": "run",
  "en": "Hill repeats",
  "ar": "تكرارات صعود المرتفعات",
  "muscle": "Power / القوة",
  "equipment": "Hill / مرتفع"
 },
 {
  "id": "mza-50",
  "category": "run",
  "en": "Strides",
  "ar": "تسارعات قصيرة",
  "muscle": "Technique / التقنية",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-51",
  "category": "run",
  "en": "Recovery run",
  "ar": "جري الاستشفاء",
  "muscle": "Recovery / الاستشفاء",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-52",
  "category": "run",
  "en": "Fartlek",
  "ar": "جري الفارتلك",
  "muscle": "Speed / السرعة",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-53",
  "category": "run",
  "en": "Progression run",
  "ar": "الجري التصاعدي",
  "muscle": "Pacing / الوتيرة",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-54",
  "category": "run",
  "en": "High knees drill",
  "ar": "تمرين رفع الركبتين",
  "muscle": "Technique / التقنية",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-55",
  "category": "run",
  "en": "A-skip drill",
  "ar": "تمرين الوثب A-skip",
  "muscle": "Technique / التقنية",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-56",
  "category": "run",
  "en": "Easy jog warm-up",
  "ar": "هرولة للإحماء",
  "muscle": "Warm-up / الإحماء",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-57",
  "category": "mobility",
  "en": "Hip flexor stretch",
  "ar": "إطالة مثنيات الورك",
  "muscle": "Hips / الوركان",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-58",
  "category": "mobility",
  "en": "Hamstring stretch",
  "ar": "إطالة خلف الفخذ",
  "muscle": "Hamstrings / خلف الفخذ",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-59",
  "category": "mobility",
  "en": "Calf stretch",
  "ar": "إطالة السمانة",
  "muscle": "Calves / السمانة",
  "equipment": "Wall / جدار"
 },
 {
  "id": "mza-60",
  "category": "mobility",
  "en": "Quadriceps stretch",
  "ar": "إطالة مقدمة الفخذ",
  "muscle": "Quadriceps / مقدمة الفخذ",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-61",
  "category": "mobility",
  "en": "Ankle mobility",
  "ar": "تحريك مفصل الكاحل",
  "muscle": "Ankles / الكاحلان",
  "equipment": "Wall / جدار"
 },
 {
  "id": "mza-62",
  "category": "mobility",
  "en": "Hip circles",
  "ar": "دوائر الورك",
  "muscle": "Hips / الوركان",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-63",
  "category": "mobility",
  "en": "Leg swings",
  "ar": "تأرجح الساق",
  "muscle": "Hips / الوركان",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-64",
  "category": "mobility",
  "en": "Thoracic rotation",
  "ar": "دوران الجزء الصدري من العمود الفقري",
  "muscle": "Back / الظهر",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-65",
  "category": "mobility",
  "en": "Cat cow",
  "ar": "تمرين القط والبقرة",
  "muscle": "Spine / العمود الفقري",
  "equipment": "Mat / بساط"
 },
 {
  "id": "mza-66",
  "category": "mobility",
  "en": "World's greatest stretch",
  "ar": "إطالة الورك والجذع المركبة",
  "muscle": "Full body / الجسم كاملاً",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-67",
  "category": "mobility",
  "en": "90/90 hip rotation",
  "ar": "دوران الورك 90/90",
  "muscle": "Hips / الوركان",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-68",
  "category": "mobility",
  "en": "Foam rolling calves",
  "ar": "تدليك السمانة بأسطوانة",
  "muscle": "Calves / السمانة",
  "equipment": "Foam roller / أسطوانة"
 },
 {
  "id": "mza-69",
  "category": "bike",
  "en": "Easy cycling",
  "ar": "ركوب الدراجة بسهولة",
  "muscle": "Aerobic / التحمل الهوائي",
  "equipment": "Bike / دراجة"
 },
 {
  "id": "mza-70",
  "category": "bike",
  "en": "Cycling intervals",
  "ar": "فترات ركوب الدراجة",
  "muscle": "Speed / السرعة",
  "equipment": "Bike / دراجة"
 },
 {
  "id": "mza-71",
  "category": "bike",
  "en": "Long endurance ride",
  "ar": "ركوب الدراجة لمسافة طويلة",
  "muscle": "Endurance / التحمل",
  "equipment": "Bike / دراجة"
 },
 {
  "id": "mza-72",
  "category": "bike",
  "en": "Cadence drills",
  "ar": "تمارين معدل تدوير الدواسات",
  "muscle": "Technique / التقنية",
  "equipment": "Bike / دراجة"
 },
 {
  "id": "mza-73",
  "category": "bike",
  "en": "Recovery ride",
  "ar": "ركوب الدراجة للاستشفاء",
  "muscle": "Recovery / الاستشفاء",
  "equipment": "Bike / دراجة"
 },
 {
  "id": "mza-74",
  "category": "swim",
  "en": "Easy freestyle",
  "ar": "سباحة حرة سهلة",
  "muscle": "Aerobic / التحمل الهوائي",
  "equipment": "Pool / مسبح"
 },
 {
  "id": "mza-75",
  "category": "swim",
  "en": "Freestyle intervals",
  "ar": "فترات السباحة الحرة",
  "muscle": "Speed / السرعة",
  "equipment": "Pool / مسبح"
 },
 {
  "id": "mza-76",
  "category": "swim",
  "en": "Kickboard drill",
  "ar": "تمرين الركل بلوح السباحة",
  "muscle": "Technique / التقنية",
  "equipment": "Kickboard / لوح"
 },
 {
  "id": "mza-77",
  "category": "swim",
  "en": "Pull buoy drill",
  "ar": "تمرين السحب بعوامة",
  "muscle": "Technique / التقنية",
  "equipment": "Pull buoy / عوامة"
 },
 {
  "id": "mza-78",
  "category": "swim",
  "en": "Easy backstroke",
  "ar": "سباحة الظهر بسهولة",
  "muscle": "Aerobic / التحمل الهوائي",
  "equipment": "Pool / مسبح"
 },
 {
  "id": "mza-79",
  "category": "swim",
  "en": "Breaststroke technique",
  "ar": "تقنية سباحة الصدر",
  "muscle": "Technique / التقنية",
  "equipment": "Pool / مسبح"
 },
 {
  "id": "mza-80",
  "category": "recovery",
  "en": "Easy walk",
  "ar": "المشي السهل",
  "muscle": "Recovery / الاستشفاء",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-81",
  "category": "recovery",
  "en": "Breathing relaxation",
  "ar": "استرخاء بالتنفس",
  "muscle": "Recovery / الاستشفاء",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-82",
  "category": "recovery",
  "en": "Rest day",
  "ar": "يوم راحة",
  "muscle": "Recovery / الاستشفاء",
  "equipment": "None / بدون معدات"
 },
 {
  "id": "mza-83",
  "category": "recovery",
  "en": "Gentle mobility flow",
  "ar": "سلسلة حركة خفيفة",
  "muscle": "Recovery / الاستشفاء",
  "equipment": "None / بدون معدات"
 }
];
const normalize=s=>String(s||'').normalize('NFKD').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآ]/g,'ا').toLowerCase().trim();
function search(query,category='all',items=catalog){const words=normalize(query).split(/\s+/).filter(Boolean);return items.filter(x=>(category==='all'||x.category===category)&&words.every(w=>normalize([x.en,x.ar,x.muscle,x.equipment,...(categories[x.category]||[])].join(' ')).includes(w)));}
function format(item,values,arabic=false){const text=(en,ar)=>arabic?ar:en;const parts=[];for(const [key,en,ar,suffix] of [['sets','sets','مجموعات',''],['reps','reps','تكرارات',''],['weight','weight','الوزن',' kg'],['distance','distance','المسافة',' km'],['duration','duration','المدة',' min'],['pace','pace','الوتيرة',' /km'],['rest','rest','الراحة',' sec']]){const v=String(values[key]||'').trim();if(v)parts.push(text(en,ar)+': '+v+suffix);}return (arabic?item.ar:item.en)+(parts.length?' — '+parts.join(' · '):'')+(values.notes?.trim()?' — '+values.notes.trim():'');}
return {catalog,categories,sport,search,format};
});
