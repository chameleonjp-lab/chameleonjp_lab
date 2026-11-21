// Generated from game rules and time-attack translations at feature branch.
(function(){
const namesJa=[
  '神速のカメレオン','閃光の怪盗','一瞬の怪盗','疾風の怪盗','幻の擬態師','無音の怪盗',
  '月下の怪盗','屋根の怪盗','擬態の名人','変色の名人','色合わせの名人','明暗の名人',
  '濃淡の名人','影渡りの達人','屋根渡りの達人','路地抜けの達人','宝石の目利き',
  '宝石の隠し役','宝石の運び手','金庫の鍵番','色合わせ職人','明暗合わせ職人',
  '色見本の職人','壁色の職人','石畳の職人','看板色の職人','屋根色の職人',
  '窓辺の見張り','路地の見張り','街角の見張り','夜道の案内役','屋根の案内役',
  '路地の案内役','街角の案内役','夜道の調べ役','路地の調べ役','壁色の調べ役',
  '窓明かりの観察役','街灯の観察役','月影の観察役','壁色の見習い',
  '看板色の見習い','屋根歩きの見習い','路地歩きの見習い','擬態の練習生',
  '明暗の練習生','変色の練習生','色探しの練習生','屋根の探検家',
  '路地の探検家','街角の探検家','石畳の歩き手','屋根下の歩き手',
  '路地の歩き手','月夜の散歩者','街灯の散歩者','街角の散歩者','街めぐりカメレオン'
];
const namesEn=[
 'Lightning Chameleon','Flash Thief','Instant Thief','Gale Thief','Phantom Mimic','Silent Thief',
 'Moonlit Thief','Rooftop Thief','Master of Disguise','Master of Color','Color-Matching Master',
 'Light and Shade Master','Shade Master','Shadow-Crossing Expert','Rooftop Expert','Alleyway Expert',
 'Gem Connoisseur','Gem Concealer','Gem Courier','Vault Keeper','Color Artisan','Light and Shade Artisan',
 'Color Sample Artisan','Wall Color Artisan','Cobblestone Artisan','Sign Color Artisan','Rooftop Color Artisan',
 'Window Watcher','Alley Watcher','Street Corner Watcher','Night Guide','Rooftop Guide','Alley Guide',
 'Street Corner Guide','Night Investigator','Alley Investigator','Wall Color Investigator',
 'Windowlight Observer','Streetlight Observer','Moonshadow Observer','Wall Color Apprentice',
 'Sign Color Apprentice','Rooftop Walking Apprentice','Alley Walking Apprentice',
 'Disguise Trainee','Brightness Trainee','Color-Changing Trainee','Color-Finding Trainee',
 'Rooftop Explorer','Alley Explorer','Street Corner Explorer','Cobblestone Walker',
 'Under-Roof Walker','Alley Walker','Moonlit Stroller','Streetlight Stroller',
 'Street Corner Stroller','City-Wandering Chameleon'
];
const keys=['mode','start','clear','quit','time','building','family','color','brightness','red','green','blue',
 'paused','resume','notCleared','unrankedQuestion','startError','anonymous','verifying','again','ranking','shareMode','shareRecord'];
const labels={
 ja:['タイムアタックモード','同系色モード','30棟クリア！','途中終了','タイム','建物','系統','色','明度','赤系','緑系','青系','一時停止','再開','未クリア','ランキングに接続できません。今回はランキング対象外で遊びますか？','開始できませんでした','ランキング対象外','記録を確認中','もう一度','ランキング','タイムアタックモード','記録'],
 en:['Time Attack Mode','Same-Color Mode','30 buildings cleared!','Quit','Time','Building','Color family','Color','Brightness','Red','Green','Blue','Paused','Resume','Not cleared','Ranking unavailable. Play without ranking this time?','Unable to start','Not ranked','Verifying result','Try again','Ranking','Time Attack Mode','Record'],
 es:['Modo contrarreloj','Modo de colores similares','¡30 edificios superados!','Salir','Tiempo','Edificio','Gama','Color','Brillo','Rojo','Verde','Azul','Pausa','Continuar','Sin completar','Ranking no disponible. ¿Jugar sin clasificación?','No se pudo iniciar','Sin clasificación','Verificando','Otra vez','Clasificación','Modo contrarreloj','Tiempo'],
 'pt-BR':['Modo contra o tempo','Modo de cores similares','30 prédios concluídos!','Sair','Tempo','Prédio','Família de cores','Cor','Brilho','Vermelho','Verde','Azul','Pausado','Continuar','Não concluído','Ranking indisponível. Jogar sem classificação?','Falha ao iniciar','Sem ranking','Verificando','Jogar de novo','Ranking','Modo contra o tempo','Tempo'],
 'zh-Hans':['计时挑战模式','同色系模式','完成30栋！','退出','时间','建筑','色系','颜色','亮度','红色系','绿色系','蓝色系','已暂停','继续','未通关','排行榜不可用，仍要以非排名方式游玩吗？','无法开始','不计排名','正在核实','再玩一次','排行榜','计时挑战模式','记录'],
 fr:['Mode contre-la-montre','Mode couleurs proches','30 bâtiments terminés !','Quitter','Temps','Bâtiment','Famille','Couleur','Luminosité','Rouge','Vert','Bleu','Pause','Reprendre','Non terminé','Classement indisponible. Jouer hors classement ?','Impossible de démarrer','Hors classement','Vérification','Rejouer','Classement','Mode contre-la-montre','Temps'],
 de:['Zeitangriffsmodus','Ähnliche-Farben-Modus','30 Gebäude geschafft!','Beenden','Zeit','Gebäude','Farbfamilie','Farbe','Helligkeit','Rot','Grün','Blau','Pause','Fortsetzen','Nicht geschafft','Rangliste nicht erreichbar. Ohne Rangliste spielen?','Start fehlgeschlagen','Ohne Rangliste','Wird geprüft','Nochmal','Rangliste','Zeitangriffsmodus','Zeit'],
 ko:['타임어택 모드','동일 계열 색상 모드','30개 건물 완료!','종료','시간','건물','색상 계열','색상','밝기','빨강 계열','초록 계열','파랑 계열','일시정지','재개','미완료','랭킹 연결 실패. 비랭킹으로 플레이할까요?','시작 실패','랭킹 제외','기록 확인 중','다시 하기','랭킹','타임어택 모드','기록'],
 ru:['Режим на время','Режим похожих цветов','30 зданий пройдено!','Выйти','Время','Здание','Гамма','Цвет','Яркость','Красная','Зелёная','Синяя','Пауза','Продолжить','Не завершено','Рейтинг недоступен. Играть без рейтинга?','Не удалось начать','Вне рейтинга','Проверка','Ещё раз','Рейтинг','Режим на время','Результат'],
 it:['Modalità a tempo','Modalità colori simili','30 edifici completati!','Esci','Tempo','Edificio','Famiglia di colori','Colore','Luminosità','Rosso','Verde','Blu','Pausa','Riprendi','Non completato','Classifica non disponibile. Giocare senza classifica?','Impossibile iniziare','Non classificato','Verifica in corso','Riprova','Classifica','Modalità a tempo','Tempo'],
 'zh-Hant':['計時挑戰模式','同色系模式','完成30棟！','退出','時間','建築','色系','顏色','亮度','紅色系','綠色系','藍色系','已暫停','繼續','未過關','排行榜無法連線，要以不計排名方式遊玩嗎？','無法開始','不計排名','正在核實','再玩一次','排行榜','計時挑戰模式','紀錄'],
 id:['Mode kejar waktu','Mode warna senada','30 gedung selesai!','Keluar','Waktu','Gedung','Kelompok warna','Warna','Kecerahan','Merah','Hijau','Biru','Jeda','Lanjutkan','Belum selesai','Peringkat tidak tersedia. Main tanpa peringkat?','Tidak bisa mulai','Tanpa peringkat','Memverifikasi','Main lagi','Peringkat','Mode kejar waktu','Rekor'],
 tr:['Zamana Karşı Mod','Benzer Renkler Modu','30 bina tamamlandı!','Çık','Süre','Bina','Renk grubu','Renk','Parlaklık','Kırmızı','Yeşil','Mavi','Duraklatıldı','Devam et','Tamamlanmadı','Sıralama kullanılamıyor. Sıralamasız oynansın mı?','Başlatılamadı','Sıralama dışı','Doğrulanıyor','Yeniden oyna','Sıralama','Zamana Karşı Mod','Süre'],
 vi:['Chế độ tính giờ','Chế độ màu cùng tông','Hoàn thành 30 tòa nhà!','Thoát','Thời gian','Tòa nhà','Nhóm màu','Màu','Độ sáng','Đỏ','Lục','Lam','Tạm dừng','Tiếp tục','Chưa hoàn thành','Không thể kết nối bảng xếp hạng. Chơi không xếp hạng?','Không thể bắt đầu','Không xếp hạng','Đang xác minh','Chơi lại','Xếp hạng','Chế độ tính giờ','Kỷ lục'],
 th:['โหมดจับเวลา','โหมดสีโทนเดียวกัน','ผ่านครบ 30 อาคาร!','ออก','เวลา','อาคาร','กลุ่มสี','สี','ความสว่าง','สีแดง','สีเขียว','สีน้ำเงิน','หยุดชั่วคราว','เล่นต่อ','ยังไม่สำเร็จ','ติดต่ออันดับไม่ได้ เล่นแบบไม่จัดอันดับหรือไม่?','เริ่มไม่ได้','ไม่นับอันดับ','กำลังตรวจสอบ','เล่นอีกครั้ง','อันดับ','โหมดจับเวลา','สถิติ']
};
const order=['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'];
window.LabI18nRows=(window.LabI18nRows||[]).concat(keys.map((key,i)=>order.map(l=>labels[l]?.[i]||labels.en[i])));
const display={red:'red',green:'green',blue:'blue'};
window.ChameleolTimeAttack={
 title(id,lang='ja'){
   if(id==null)return lang==='ja'?'30棟完走':'30 buildings completed';
   const match=/^ta\\.title\\.(\\d{2})$/.exec(id);
   const i=match?Number(match[1])-1:-1;
   if(i<0||i>=58)return lang==='ja'?'30棟完走':'30 buildings completed';
   return lang==='ja'?namesJa[i]:namesEn[i];
 },
 family(value,lang='ja'){
   const key=display[value];const i=keys.indexOf(key);
   return i<0?value:(labels[lang]?.[i]||labels.en[i]);
 },
 text(key,lang='ja'){
   const i=keys.indexOf(key);return i<0?key:(labels[lang]?.[i]||labels.en[i]);
 }
};
})();
