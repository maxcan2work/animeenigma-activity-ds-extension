(() => {
  const STRINGS = {
    en: {
      'popup.subtitle': 'Discord Rich Presence',
      'popup.enabled': 'Enabled',
      'popup.locale': 'Activity language',
      'popup.bridgeUrl': 'Bridge URL',
      'popup.showProfileButton': 'Profile button in activity',
      'popup.save': 'Save',
      'popup.saved': 'Saved.',
      'popup.checking': 'Checking bridge…',
      'popup.bridgeOffline':
        'Bridge offline. Run bridge (npm start) with Discord Desktop open.',
      'popup.discordNotReady':
        'Bridge up, Discord RPC not ready — open Discord Desktop.',
      'popup.ok': 'Bridge + Discord OK',
      'popup.apiWatching': 'API: watching',
      'popup.apiIdle': 'API: idle',
      'popup.apiMissing': 'API key not set in bridge .env',

      'page.browse': 'Browsing catalog',
      'page.schedule': 'Checking schedule',
      'page.themes': 'Browsing themes (OP/ED)',
      'page.recs': 'Looking at recommendations',
      'page.following': 'Following feed',
      'page.anidle': 'Playing Anidle',
      'page.gacha': 'In gacha',
      'page.fanfics': 'Reading fanfics',
      'page.collection': 'Browsing a collection',
      'page.downloads': 'Downloads',
      'page.about': 'About page',
      'page.auth': 'Logging in',
      'page.admin': 'Admin panel',
      'page.home': 'On the home page',
      'page.browsing': 'Browsing AnimeEnigma',
      'page.profile': 'Viewing profile',
      'page.character': 'Character page',
      'page.watchTogether': 'Watch together',
      'page.sharedRoom': 'Shared room',
      'page.gameLobby': 'Game lobby',
      'page.guessOp': 'Guess the opening',
      'page.browsingRooms': 'Browsing rooms',
      'page.room': 'Room {id}…',
      'page.animePage': 'Anime page',
      'page.playing': 'On page · playing',
      'page.paused': 'On page · paused',
      'page.episode': 'Episode {n}',
      'page.profileFallback': 'Profile',
      'anime.fallback': 'Anime',

      'state.browse': 'Plot armor loading…',
      'state.schedule': 'Waiting for the next episode drop',
      'state.themes': 'Humming the chorus already',
      'state.recs': 'Trusting the algorithm (carefully)',
      'state.following': 'Checking what friends are into',
      'state.anidle': 'One more guess, surely',
      'state.gacha': 'Just one more pull…',
      'state.fanfics': 'What if…?',
      'state.collection': 'Curating vibes',
      'state.downloads': 'Hoarding for later',
      'state.about': 'Reading the fine print',
      'state.auth': 'Entering the enigma',
      'state.admin': 'With great power…',
      'state.home': 'Looking for something interesting',
      'state.browsing': 'Wandering the catalog voids',
      'state.profile': 'Peeking behind the curtain',
      'state.character': 'Studying the lore',
      'state.watchTogether': 'Syncing snacks and spoilers',
      'state.gameLobby': 'Warming up the brain cells',
      'state.guessOp': 'Name that banger',
      'state.browsingRooms': 'Finding a worthy opponent',

      'btn.home': 'Open website',
      'btn.anime': 'Watch too',
      'btn.profile': 'Open profile',

      'api.watching': 'Watching',
      'api.episode': 'Episode {n}',
    },
    ru: {
      'popup.subtitle': 'Discord Rich Presence',
      'popup.enabled': 'Включено',
      'popup.locale': 'Язык активности',
      'popup.bridgeUrl': 'URL bridge',
      'popup.showProfileButton': 'Кнопка профиля в активности',
      'popup.save': 'Сохранить',
      'popup.saved': 'Сохранено.',
      'popup.checking': 'Проверка bridge…',
      'popup.bridgeOffline':
        'Bridge офлайн. Запусти bridge (npm start) при открытом Discord Desktop.',
      'popup.discordNotReady':
        'Bridge работает, Discord RPC не готов — открой Discord Desktop.',
      'popup.ok': 'Bridge + Discord OK',
      'popup.apiWatching': 'API: смотрит',
      'popup.apiIdle': 'API: idle',
      'popup.apiMissing': 'Нет API key в bridge .env',

      'page.browse': 'Смотрит каталог',
      'page.schedule': 'Смотрит расписание',
      'page.themes': 'Смотрит темы (OP/ED)',
      'page.recs': 'Смотрит рекомендации',
      'page.following': 'Лента подписок',
      'page.anidle': 'Играет в Anidle',
      'page.gacha': 'В гаче',
      'page.fanfics': 'Читает фанфики',
      'page.collection': 'Смотрит коллекцию',
      'page.downloads': 'Загрузки',
      'page.about': 'Страница About',
      'page.auth': 'Вход',
      'page.admin': 'Админка',
      'page.home': 'На главной',
      'page.browsing': 'На AnimeEnigma',
      'page.profile': 'Смотрит профиль',
      'page.character': 'Страница персонажа',
      'page.watchTogether': 'Смотрит вместе',
      'page.sharedRoom': 'Общая комната',
      'page.gameLobby': 'Лобби игры',
      'page.guessOp': 'Угадай опенинг',
      'page.browsingRooms': 'Выбор комнаты',
      'page.room': 'Комната {id}…',
      'page.animePage': 'Страница аниме',
      'page.playing': 'На странице · играет',
      'page.paused': 'На странице · пауза',
      'page.episode': 'Серия {n}',
      'page.profileFallback': 'Профиль',
      'anime.fallback': 'Аниме',

      'state.browse': 'Листает судьбы персонажей',
      'state.schedule': 'Ждёт дроп новой серии',
      'state.themes': 'Уже напевает припев',
      'state.recs': 'Доверяет алгоритму… почти',
      'state.following': 'Подсматривает вкусы друзей',
      'state.anidle': 'Ещё одна попытка, точно',
      'state.gacha': 'Ну ещё один круток…',
      'state.fanfics': 'А что, если…?',
      'state.collection': 'Собирает вайбы',
      'state.downloads': 'Копит на потом',
      'state.about': 'Читает мелкий шрифт',
      'state.auth': 'Входит в загадку',
      'state.admin': 'С великой силой…',
      'state.home': 'В поисках чего-то интересного',
      'state.browsing': 'Бродит между тайтлами',
      'state.profile': 'Заглядывает за кулисы',
      'state.character': 'Изучает лор',
      'state.watchTogether': 'Синхронизирует снеки',
      'state.gameLobby': 'Разогревает извилины',
      'state.guessOp': 'Узнай этот бэнгер',
      'state.browsingRooms': 'Ищет достойного соперника',

      'btn.home': 'Открыть веб-сайт',
      'btn.anime': 'Смотреть тоже',
      'btn.profile': 'Открыть профиль',

      'api.watching': 'Смотрит',
      'api.episode': 'Серия {n}',
    },
    ja: {
      'popup.subtitle': 'Discord Rich Presence',
      'popup.enabled': '有効',
      'popup.locale': 'ステータス言語',
      'popup.bridgeUrl': 'Bridge URL',
      'popup.showProfileButton': 'プロフィールボタンを表示',
      'popup.save': '保存',
      'popup.saved': '保存しました。',
      'popup.checking': 'Bridge を確認中…',
      'popup.bridgeOffline':
        'Bridge オフライン。Discord Desktop を開いて bridge を起動してください。',
      'popup.discordNotReady':
        'Bridge は起動中ですが Discord RPC 未接続です。',
      'popup.ok': 'Bridge + Discord OK',
      'popup.apiWatching': 'API: 視聴中',
      'popup.apiIdle': 'API: idle',
      'popup.apiMissing': 'bridge .env に API key がありません',

      'page.browse': 'カタログを閲覧中',
      'page.schedule': 'スケジュールを確認中',
      'page.themes': 'テーマ（OP/ED）を閲覧中',
      'page.recs': 'おすすめを見ています',
      'page.following': 'フォロー中のフィード',
      'page.anidle': 'Anidle をプレイ中',
      'page.gacha': 'ガチャ中',
      'page.fanfics': 'ファンフィクションを読書中',
      'page.collection': 'コレクションを閲覧中',
      'page.downloads': 'ダウンロード',
      'page.about': 'About ページ',
      'page.auth': 'ログイン中',
      'page.admin': '管理画面',
      'page.home': 'ホーム',
      'page.browsing': 'AnimeEnigma を閲覧中',
      'page.profile': 'プロフィールを閲覧中',
      'page.character': 'キャラクターページ',
      'page.watchTogether': '一緒に視聴中',
      'page.sharedRoom': '共有ルーム',
      'page.gameLobby': 'ゲームロビー',
      'page.guessOp': 'オープニング当て',
      'page.browsingRooms': 'ルーム一覧',
      'page.room': 'ルーム {id}…',
      'page.animePage': 'アニメページ',
      'page.playing': 'ページ上 · 再生中',
      'page.paused': 'ページ上 · 一時停止',
      'page.episode': '第{n}話',
      'page.profileFallback': 'プロフィール',
      'anime.fallback': 'アニメ',

      'state.browse': '物語を物色中…',
      'state.schedule': '次の放送を待ち構えてる',
      'state.themes': 'サビを口ずさんでいる',
      'state.recs': 'アルゴリズムを信じてみる',
      'state.following': '友だちの趣味をのぞき見',
      'state.anidle': 'もう一回だけ…たぶん',
      'state.gacha': 'あと一回だけガチャ…',
      'state.fanfics': 'もしも…？',
      'state.collection': '雰囲気を収集中',
      'state.downloads': 'あとで見る用に確保',
      'state.about': '細かい字を読んでる',
      'state.auth': '謎の世界へログイン',
      'state.admin': '大いなる力には…',
      'state.home': 'おもしろいものを探してる',
      'state.browsing': 'タイトルの海をさまよう',
      'state.profile': '舞台裏をのぞいている',
      'state.character': '設定を調べている',
      'state.watchTogether': 'おやつとネタバレ同期中',
      'state.gameLobby': '脳みそウォームアップ',
      'state.guessOp': '名曲当てチャレンジ',
      'state.browsingRooms': 'ライバル募集中',

      'btn.home': 'ウェブサイトを開く',
      'btn.anime': '一緒に見る',
      'btn.profile': 'プロフィールを開く',

      'api.watching': '視聴中',
      'api.episode': '第{n}話',
    },
  }

  function normalizeLocale(value) {
    const v = String(value || '').toLowerCase()
    if (v === 'ru' || v === 'rus' || v === 'ru-ru') return 'ru'
    if (v === 'ja' || v === 'jp' || v === 'jpn' || v === 'ja-jp') return 'ja'
    return 'en'
  }

  function t(locale, key, vars = {}) {
    const lang = normalizeLocale(locale)
    const table = STRINGS[lang] || STRINGS.en
    let out = table[key] || STRINGS.en[key] || key
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v))
    }
    return out
  }

  function animeTitle(locale, anime, fallback) {
    if (!anime || typeof anime !== 'object') return fallback || t(locale, 'anime.fallback')
    const lang = normalizeLocale(locale)
    if (lang === 'ru') {
      return anime.name_ru || anime.name || anime.name_jp || anime.title || fallback || t(locale, 'anime.fallback')
    }
    if (lang === 'ja') {
      return anime.name_jp || anime.name || anime.name_ru || anime.title || fallback || t(locale, 'anime.fallback')
    }
    return anime.name || anime.name_en || anime.name_ru || anime.name_jp || anime.title || fallback || t(locale, 'anime.fallback')
  }

  globalThis.AeI18n = { STRINGS, normalizeLocale, t, animeTitle }
})()
