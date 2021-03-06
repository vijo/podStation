var Podcast = function(url) {
	var defaultImage = 'images/rss-alt-8x.png';

	this.url = url;
	this.image = defaultImage;
	this.status = 'new';
	this.episodes = [];

	var idNotificationFailed = 0;
	var idNotificationNewEpisodes = 0;

	function podcastChanged(podcast, episodeListChanged) {
		messageService.for('podcast').sendMessage('changed', {
			podcast: podcast,
			episodeListChanged: episodeListChanged ? true : false
		});
	}

	function guidsFromEpisodes(episodes) {
		var guids = [];

		episodes.forEach(function(episode) {
			guids.push(episode.guid);
		});

		return guids;
	}
	
	function postProcessPubDate(pubDate) {
		return pubDate.replace('GTM', 'GMT');
	}

	this.getKey = function() {
		return 'podcast' + this.url;
	};

	this.store = function() {
		var storageObject = {};

		var storedPodcast = {};

		storedPodcast.title = this.title;
		storedPodcast.description = this.description;
		storedPodcast.link = this.link;
		storedPodcast.pubDate = this.pubDate;
		storedPodcast.image = this.image;
		storedPodcast.episodes = this.episodes;

		storageObject[this.getKey()] = storedPodcast;

		chrome.storage.local.set(storageObject);
	};

	this.deleteFromStorage = function() {
		chrome.storage.local.remove(this.getKey());
	};

	function processMultiTagText(selectedTags) {
		var text = '';
		var texts = [];

		selectedTags.each(function() {
			var selectedTag = $(this);
			if(texts.indexOf(selectedTag.text()) < 0) {
				if(text) {
					text += '<br>';
				}

				text += selectedTag.text();

				texts.push(selectedTag.text());
			}
		});

		return text;
	}

	this.isUpdating = function() {
		return this.status == 'updating';
	};

	this.update = function() {
		var that = this;

		if(this.isUpdating()) {
			console.log('Already updating: ' + this.url);
			return;
		}

		this.status = 'updating';
		console.log('Updating: ' + this.url);

		$.ajaxSetup({
			cache: false,

			accepts: {
				xml: 'application/rss+xml, application/xml, text/xml'
			}
		});

		var jqxhr = $.get(this.url, function(data) {
			var xml = $(data);

			if(!xml.find('rss > channel')[0]) {
				that.status = 'failed';
				podcastChanged(that);
				return;
			}

			that.title = xml.find('rss > channel > title').text();
			that.description = processMultiTagText(xml.find('rss > channel > description'));
			that.link = xml.find('rss > channel > link').text();

			that.pubDate = postProcessPubDate(xml.find('rss > channel > pubDate').text());
			if(that.pubDate === '') {
				that.pubDate = postProcessPubDate(xml.find('rss > channel > lastBuildDate').text());
			}

			that.image = xml.find('rss > channel > image > url').text();
			if(that.image === undefined || that.image === "") {
				that.image = xml.find('rss > channel > image').attr('href');
			}
			if(that.image === undefined || that.image === "") {
				that.image = defaultImage;
			}

			var newEpisodesCount = 0;
			var guids = guidsFromEpisodes(that.episodes);
			that.episodes = [];

			xml.find('rss > channel > item').each(function() {
				var feedItem = $(this);
				var episode = {};
				var enclosure;

				// the selector will find 'title' for all namespaces, we may find more
				// than one. They are in theory all the same, so we take the first.
				episode.title = $(feedItem.find('title')[0]).text();
				episode.link = feedItem.find('link').text();
				episode.pubDate = postProcessPubDate(feedItem.find('pubDate').text());
				episode.description = feedItem.find('description').text();
				episode.guid = feedItem.find('guid').text();
				enclosure = feedItem.find('enclosure');
				episode.enclosure = {
					url: enclosure.attr('url'),
					length: enclosure.attr('length'),
					type: enclosure.attr('type')
				};

				if(guids.indexOf(episode.guid) < 0) {
					newEpisodesCount++;
				}

				that.episodes.push(episode);
			});

			that.episodes.sort(byPubDateDescending);

			if(that.episodes[0] && that.episodes[0].pubDate  &&
				(
					that.pubDate === undefined || that.pubDate === '' ||
					(new Date(that.episodes[0].pubDate)) > (new Date(that.pubDate))
				)
			) {
				that.pubDate = that.episodes[0].pubDate;
			}
			
			that.status = 'loaded';
			podcastChanged(that, true);
			that.store();

			if(idNotificationFailed) {
				notificationManager.removeNotification(idNotificationFailed);
			}

			if(newEpisodesCount) {
				idNotificationNewEpisodes = notificationManager.updateNotification(idNotificationNewEpisodes, {
					icon: 'fa-check',
					groupName: 'New episodes',
					text: newEpisodesCount + ' new episode(s) for ' + that.title
				});
			}

		}, 'xml').fail(function() {
			that.status = 'failed';
			podcastChanged(that);
			idNotificationFailed = notificationManager.updateNotification(idNotificationFailed, {
				icon: 'fa-close',
				groupName: 'Failed to update podcasts',
				text: 'Failed to update ' + (that.title ? that.title : that.url)
			});
		});

		podcastChanged(this);

		return jqxhr;
	};

	this.load = function() {
		var that = this;

		var podcastKey = this.getKey();

		chrome.storage.local.get(podcastKey, function(storageObject) {
			if(storageObject && storageObject[podcastKey]) {
				var storedPodcast = storageObject[podcastKey];

				that.title = storedPodcast.title;
				that.description = storedPodcast.description;
				that.link = storedPodcast.link;
				that.pubDate = storedPodcast.pubDate;
				that.image = storedPodcast.image;
				that.episodes = storedPodcast.episodes;
				that.status = 'loaded';
			}
			else {
				that.update();
			}
		});
	};
}
