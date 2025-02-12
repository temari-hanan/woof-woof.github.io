/*********************************************
 * ① 再生する曲データの初期化
 *********************************************/
var availableSongs = initSongs();

/*********************************************
 * グローバル変数の定義
 *********************************************/
var playlist = [];         // ユーザー選択した再生リスト（曲オブジェクト）
var currentVideoIndex = 0; // 現在再生中の曲のインデックス
var player;                // YouTube プレイヤーオブジェクト
var timeCheckInterval;     // 再生時間チェック用タイマー
var YT_ready = false;      // YouTube API 読み込み完了フラグ
var loopEnabled = false;   // ループ再生（初期OFF）
var shuffleEnabled = false;// シャッフル再生（初期OFF）
var playedShuffleIndices = []; // シャッフル再生時に既に再生した曲のインデックス

// チェック状態（選択済み曲）の保存（availableSongs の index を保持）
// localStorage からデータを取得。存在しない場合は空配列を初期値とする
var selectedSongsIndices = JSON.parse(localStorage.getItem("selectedSongs") || "[]");

/*********************************************
 * 保存済み再生リストの管理
 *********************************************/
function getSavedPlaylists() {
  return JSON.parse(localStorage.getItem("savedPlaylists") || "[]");
}
function setSavedPlaylists(playlists) {
  localStorage.setItem("savedPlaylists", JSON.stringify(playlists));
}
function updateSavedPlaylistsSelect() {
  var saved = getSavedPlaylists();
  var $select = $('#savedPlaylists');
  $select.empty();
  saved.forEach(function(pl){
    $select.append($('<option>').val(pl.name).text(pl.name));
  });
  // 保存済み再生リストが存在する場合のみ表示
  if (saved.length > 0) {
    $('.saved-playlists').show();
  } else {
    $('.saved-playlists').hide();
  }
}

/*********************************************
 * YouTubeリンクから動画再生用パラメータを取得する関数
 *********************************************/
function getVideoParams(song) {
  var link = song.youtubeLinks[0];
  try {
    var url = new URL(link);
    var pathParts = url.pathname.split('/');
    var videoId = pathParts[2];
    var start = parseInt(url.searchParams.get("start") || "0", 10);
    var end = parseInt(url.searchParams.get("end") || "0", 10);
    return { videoId: videoId, start: start, end: end };
  } catch (e) {
    console.error("YouTube URLのパースに失敗しました: " + link);
    return { videoId: '', start: 0, end: 0 };
  }
}

/*********************************************
 * 曲一覧をフィルタ・レンダリングする関数
 *********************************************/
function renderSongList() {
  var keyword = document.getElementById("searchSong").value.toLowerCase();
  var songsDiv = document.getElementById("songs");
  songsDiv.innerHTML = "";
  availableSongs.forEach(function(song, index) {
    // 入力されたキーワードが song プロパティに含まれているか
    if (keyword && song.song.toLowerCase().indexOf(keyword) === -1) {
      return;
    }
    var div = document.createElement("div");
    div.className = "song-item";
    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "song_checkbox_" + index;
    checkbox.setAttribute("data-index", index);
    if (selectedSongsIndices.indexOf(index) !== -1) {
      checkbox.checked = true;
    }
    checkbox.addEventListener("change", function() {
      var idx = parseInt(this.getAttribute("data-index"), 10);
      if (this.checked) {
        if (selectedSongsIndices.indexOf(idx) === -1) {
          selectedSongsIndices.push(idx);
        }
      } else {
        selectedSongsIndices = selectedSongsIndices.filter(function(i) { return i !== idx; });
      }
      // 変更後の配列を localStorage に保存
      localStorage.setItem("selectedSongs", JSON.stringify(selectedSongsIndices));
    });
    var label = document.createElement("label");
    label.htmlFor = "song_checkbox_" + index;
    label.textContent = " " + song.song;
    div.appendChild(checkbox);
    div.appendChild(label);
    songsDiv.appendChild(div);
  });
}

/*********************************************
 * ページ読み込み後の初期処理
 *********************************************/
$(document).ready(function() {
  renderSongList();
  updateSavedPlaylistsSelect();

  $('#searchArtist, #searchSong').on('keyup', function(){
    renderSongList();
  });

  $('#toggleLoop').click(function(){
    loopEnabled = !loopEnabled;
    $(this).toggleClass('active', loopEnabled);
  });
  $('#toggleShuffle').click(function(){
    shuffleEnabled = !shuffleEnabled;
    $(this).toggleClass('active', shuffleEnabled);
  });

  // 「再生開始」ボタン押下時の処理（画面上部にスクロール）
  $('.startPlaylist').click(function(){
    if (selectedSongsIndices.length === 0) {
      alert('再生する曲が選択されていません。');
      return;
    }
    $('html, body').animate({ scrollTop: 0 }, 500);

    // 現在のチェック状態から再生リストを作成
    playlist = [];
    selectedSongsIndices.forEach(function(idx){
      if (availableSongs[idx]) {
        playlist.push(availableSongs[idx]);
      }
    });
    // シャッフル再生時は最初の曲もランダムに選択
    if (shuffleEnabled) {
      playedShuffleIndices = [];
      currentVideoIndex = Math.floor(Math.random() * playlist.length);
      playedShuffleIndices.push(currentVideoIndex);
    } else {
      currentVideoIndex = 0;
    }
    $('#player').show();
    $('#navButtons').show(); // 前/次ボタンを表示
    var videoParams = getVideoParams(playlist[currentVideoIndex]);
    if (player) {
      player.loadVideoById({
        videoId: videoParams.videoId,
        startSeconds: videoParams.start,
        endSeconds: videoParams.end
      });
      startCheckingTime();
    } else {
      if (YT_ready) {
        createPlayer();
      } else {
        alert('YouTube API の読み込みが完了していません。少し待ってから再度お試しください。');
      }
    }
  });

  // 保存済み再生リストの「読み込み」ボタン
  $('#loadPlaylist').click(function(){
    var selectedName = $('#savedPlaylists').val();
    if (!selectedName) return;
    var saved = getSavedPlaylists();
    var pl = saved.find(function(p){ return p.name === selectedName; });
    if (pl) {
      selectedSongsIndices = pl.songs;
      localStorage.setItem("selectedSongs", JSON.stringify(selectedSongsIndices));
      renderSongList();
      // チェック状態更新後、再生開始イベントを発火
      $('#startPlaylist').click();
    }
  });

  // 保存済み再生リストの「保存」ボタン
  $('#savePlaylist').click(function(){
    var name = $('#playlistName').val().trim();
    if (!name) {
      alert("再生リスト名を入力してください。");
      return;
    }
    var saved = getSavedPlaylists();
    var existing = saved.find(function(p){ return p.name === name; });
    if (existing) {
      existing.songs = selectedSongsIndices;
    } else {
      saved.push({ name: name, songs: selectedSongsIndices });
    }
    setSavedPlaylists(saved);
    updateSavedPlaylistsSelect();
    $('.saved-playlists').show();
    alert("再生リストを保存しました。");
  });

  // 保存済み再生リストの「削除」ボタン
  $('#deletePlaylist').click(function(){
    var selectedName = $('#savedPlaylists').val();
    if (!selectedName) return;
    // 確認ダイアログを表示
    if (!confirm("本当にこの再生リストを削除してもよろしいですか？")) {
      return; // キャンセルの場合、処理を中断
    }
    var saved = getSavedPlaylists();
    saved = saved.filter(function(p){ return p.name !== selectedName; });
    setSavedPlaylists(saved);
    updateSavedPlaylistsSelect();
  });

  // 前の曲、次の曲ボタンのクリックイベント
  $('#prevButton').click(function(){
    loadPreviousVideo();
  });
  $('#nextButton').click(function(){
    loadNextVideo();
  });

  // 【追加】「リセット」ボタン：チェック済みの選択を全解除
  $('.resetSelections').click(function(){
    selectedSongsIndices = [];
    localStorage.setItem("selectedSongs", JSON.stringify(selectedSongsIndices));
    renderSongList();
  });
});

/*********************************************
 * YouTube IFrame API コールバック
 *********************************************/
function onYouTubeIframeAPIReady() {
  YT_ready = true;
}

/*********************************************
 * プレイヤー生成とイベント設定
 *********************************************/
function createPlayer() {
  var videoParams = getVideoParams(playlist[currentVideoIndex]);
  player = new YT.Player('player', {
    height: '240',
    width: '100%',
    videoId: videoParams.videoId,
    playerVars: {
      autoplay: 1,
      controls: 1,
      start: videoParams.start,
      end: videoParams.end,
      modestbranding: 1
    },
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange
    }
  });
}

function onPlayerReady(event) {
  event.target.playVideo();
  startCheckingTime();
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    startCheckingTime();
  } else {
    stopCheckingTime();
  }
  if (event.data === YT.PlayerState.ENDED) {
    loadNextVideo();
  }
}

/*********************************************
 * 再生時間の定期チェック
 *********************************************/
function startCheckingTime() {
  if (timeCheckInterval) clearInterval(timeCheckInterval);
  timeCheckInterval = setInterval(function() {
    var currentTime = player.getCurrentTime();
    var videoParams = getVideoParams(playlist[currentVideoIndex]);
    if (currentTime >= videoParams.end + 2) {
      loadNextVideo();
    }
  }, 500);
}

function stopCheckingTime() {
  if (timeCheckInterval) {
    clearInterval(timeCheckInterval);
    timeCheckInterval = null;
  }
}

/*********************************************
 * 次の動画読み込み（ループ＆シャッフル共存対応）
 *********************************************/
function loadNextVideo() {
  stopCheckingTime();
  if (shuffleEnabled) {
    if (playlist.length === 1) {
      var videoParams = getVideoParams(playlist[currentVideoIndex]);
      player.loadVideoById({
        videoId: videoParams.videoId,
        startSeconds: videoParams.start,
        endSeconds: videoParams.end
      });
      startCheckingTime();
      return;
    }
    if (playedShuffleIndices.length >= playlist.length) {
      if (loopEnabled) {
        playedShuffleIndices = [];
      } else {
        player.pauseVideo();
        return;
      }
    }
    var remaining = [];
    for (var i = 0; i < playlist.length; i++) {
      if (playedShuffleIndices.indexOf(i) === -1) {
        remaining.push(i);
      }
    }
    if (remaining.length === 0) {
      player.pauseVideo();
      return;
    }
    var randomIndex = remaining[Math.floor(Math.random() * remaining.length)];
    currentVideoIndex = randomIndex;
    playedShuffleIndices.push(randomIndex);
    var videoParams = getVideoParams(playlist[currentVideoIndex]);
    player.loadVideoById({
      videoId: videoParams.videoId,
      startSeconds: videoParams.start,
      endSeconds: videoParams.end
    });
    startCheckingTime();
  } else {
    if (currentVideoIndex >= playlist.length - 1) {
      if (loopEnabled) {
        currentVideoIndex = 0;
      } else {
        player.pauseVideo();
        return;
      }
    } else {
      currentVideoIndex++;
    }
    var videoParams = getVideoParams(playlist[currentVideoIndex]);
    player.loadVideoById({
      videoId: videoParams.videoId,
      startSeconds: videoParams.start,
      endSeconds: videoParams.end
    });
    startCheckingTime();
  }
}

/*********************************************
 * 前の動画を読み込む関数
 *********************************************/
function loadPreviousVideo() {
  stopCheckingTime();
  if (shuffleEnabled) {
    if (playedShuffleIndices.length > 1) {
      playedShuffleIndices.pop();
      currentVideoIndex = playedShuffleIndices[playedShuffleIndices.length - 1];
      var videoParams = getVideoParams(playlist[currentVideoIndex]);
      player.loadVideoById({
        videoId: videoParams.videoId,
        startSeconds: videoParams.start,
        endSeconds: videoParams.end
      });
      startCheckingTime();
    }
  } else {
    if (currentVideoIndex > 0) {
      currentVideoIndex--;
    } else {
      if (loopEnabled) {
        currentVideoIndex = playlist.length - 1;
      } else {
        return;
      }
    }
    var videoParams = getVideoParams(playlist[currentVideoIndex]);
    player.loadVideoById({
      videoId: videoParams.videoId,
      startSeconds: videoParams.start,
      endSeconds: videoParams.end
    });
    startCheckingTime();
  }
}
